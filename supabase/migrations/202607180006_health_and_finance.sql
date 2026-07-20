begin;

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source text not null default 'google_sheets',
  external_key text not null,
  transaction_date date not null,
  amount numeric(14, 2) not null,
  currency text not null,
  category text,
  description text,
  account text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_transactions_user_id_not_blank_check
    check (length(btrim(user_id)) > 0),
  constraint finance_transactions_source_check
    check (source = 'google_sheets'),
  constraint finance_transactions_external_key_check
    check (external_key ~ '^[a-f0-9]{64}$'),
  constraint finance_transactions_amount_check
    check (amount <> 0 and abs(amount) <= 1000000000),
  constraint finance_transactions_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint finance_transactions_category_check
    check (category is null or length(category) between 1 and 80),
  constraint finance_transactions_description_check
    check (description is null or length(description) between 1 and 500),
  constraint finance_transactions_account_check
    check (account is null or length(account) between 1 and 120),
  constraint finance_transactions_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint finance_transactions_source_key_unique
    unique (user_id, source, external_key)
);

create index if not exists finance_transactions_user_date_idx
  on public.finance_transactions (user_id, transaction_date desc);
create index if not exists finance_transactions_user_category_idx
  on public.finance_transactions (user_id, category, transaction_date desc);

drop trigger if exists finance_transactions_set_updated_at
  on public.finance_transactions;
create trigger finance_transactions_set_updated_at
before update on public.finance_transactions
for each row execute function public.set_updated_at();

alter table public.finance_transactions enable row level security;
revoke all privileges on table public.finance_transactions
from anon, authenticated;
grant select, insert, update, delete on table public.finance_transactions
to service_role;

create or replace function public.upsert_daily_activity(
  p_user_id text,
  p_log_date date,
  p_activity jsonb
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  daily_log_id uuid;
  metric_key text;
  recorded_at_value timestamptz;
  has_metric boolean := false;
begin
  if p_user_id is null
     or length(btrim(p_user_id)) < 1
     or length(p_user_id) > 128 then
    raise exception 'Invalid activity user id' using errcode = '22023';
  end if;

  if p_log_date is null
     or p_log_date < date '2000-01-01'
     or p_log_date > date '2100-12-31' then
    raise exception 'Invalid activity date' using errcode = '22023';
  end if;

  if p_activity is null or jsonb_typeof(p_activity) <> 'object' then
    raise exception 'Activity must be a JSON object' using errcode = '22023';
  end if;

  if p_activity - array[
    'source',
    'recorded_at',
    'sleep_minutes',
    'sleep_score',
    'steps',
    'kcal_active',
    'minutes_active',
    'resting_hr',
    'hrv',
    'vo2_max',
    'weight_kg'
  ]::text[] <> '{}'::jsonb then
    raise exception 'Activity contains unsupported fields' using errcode = '22023';
  end if;

  if p_activity ->> 'source' <> 'apple_health'
     or jsonb_typeof(p_activity -> 'recorded_at') <> 'string' then
    raise exception 'Invalid activity source or timestamp' using errcode = '22023';
  end if;

  begin
    recorded_at_value := (p_activity ->> 'recorded_at')::timestamptz;
  exception when others then
    raise exception 'Invalid activity timestamp' using errcode = '22023';
  end;

  if recorded_at_value is null then
    raise exception 'Invalid activity timestamp' using errcode = '22023';
  end if;

  foreach metric_key in array array[
    'sleep_minutes',
    'sleep_score',
    'steps',
    'kcal_active',
    'minutes_active',
    'resting_hr',
    'hrv',
    'vo2_max',
    'weight_kg'
  ] loop
    if not (p_activity ? metric_key)
       or jsonb_typeof(p_activity -> metric_key) not in ('number', 'null') then
      raise exception 'Invalid activity metric: %', metric_key
        using errcode = '22023';
    end if;

    if jsonb_typeof(p_activity -> metric_key) = 'number' then
      has_metric := true;
    end if;
  end loop;

  if not has_metric then
    raise exception 'At least one activity metric is required'
      using errcode = '22023';
  end if;

  if coalesce((p_activity ->> 'sleep_minutes')::numeric, 0) not between 0 and 1440
     or coalesce((p_activity ->> 'sleep_score')::numeric, 0) not between 0 and 100
     or coalesce((p_activity ->> 'steps')::numeric, 0) not between 0 and 200000
     or coalesce((p_activity ->> 'kcal_active')::numeric, 0) not between 0 and 20000
     or coalesce((p_activity ->> 'minutes_active')::numeric, 0) not between 0 and 1440
     or coalesce((p_activity ->> 'resting_hr')::numeric, 20) not between 20 and 250
     or coalesce((p_activity ->> 'hrv')::numeric, 0) not between 0 and 1000
     or coalesce((p_activity ->> 'vo2_max')::numeric, 5) not between 5 and 100
     or coalesce((p_activity ->> 'weight_kg')::numeric, 20) not between 20 and 500 then
    raise exception 'Activity metric is outside the accepted range'
      using errcode = '22023';
  end if;

  insert into public.daily_logs as daily_log (user_id, log_date, notes)
  values (
    p_user_id,
    p_log_date,
    pg_catalog.jsonb_build_object('activity', p_activity)
  )
  on conflict (user_id, log_date) do update
  set notes = pg_catalog.jsonb_set(
    daily_log.notes,
    '{activity}',
    p_activity,
    true
  )
  returning id into daily_log_id;

  return daily_log_id;
end;
$function$;

create or replace function public.sync_finance_transactions(
  p_user_id text,
  p_transactions jsonb
)
returns table (upserted_count integer, deleted_count integer)
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  transaction_item jsonb;
  parsed_date date;
  parsed_amount numeric;
  upserted_rows integer := 0;
  deleted_rows integer := 0;
begin
  if p_user_id is null
     or length(btrim(p_user_id)) < 1
     or length(p_user_id) > 128 then
    raise exception 'Invalid finance user id' using errcode = '22023';
  end if;

  if p_transactions is null or jsonb_typeof(p_transactions) <> 'array' then
    raise exception 'Finance transactions must be a JSON array'
      using errcode = '22023';
  end if;

  if pg_catalog.jsonb_array_length(p_transactions) > 5000 then
    raise exception 'Too many finance transactions' using errcode = '22023';
  end if;

  for transaction_item in
    select value
    from pg_catalog.jsonb_array_elements(p_transactions)
  loop
    if jsonb_typeof(transaction_item) <> 'object'
       or transaction_item - array[
         'external_key',
         'transaction_date',
         'amount',
         'currency',
         'category',
         'description',
         'account',
         'metadata'
       ]::text[] <> '{}'::jsonb
       or jsonb_typeof(transaction_item -> 'external_key') <> 'string'
       or (transaction_item ->> 'external_key') !~ '^[a-f0-9]{64}$'
       or jsonb_typeof(transaction_item -> 'transaction_date') <> 'string'
       or jsonb_typeof(transaction_item -> 'amount') <> 'number'
       or jsonb_typeof(transaction_item -> 'currency') <> 'string'
       or (transaction_item ->> 'currency') !~ '^[A-Z]{3}$'
       or (
         transaction_item ? 'category'
         and jsonb_typeof(transaction_item -> 'category') not in ('string', 'null')
       )
       or (
         transaction_item ? 'description'
         and jsonb_typeof(transaction_item -> 'description') not in ('string', 'null')
       )
       or (
         transaction_item ? 'account'
         and jsonb_typeof(transaction_item -> 'account') not in ('string', 'null')
       )
       or jsonb_typeof(coalesce(transaction_item -> 'metadata', '{}'::jsonb)) <> 'object' then
      raise exception 'Invalid finance transaction structure'
        using errcode = '22023';
    end if;

    begin
      parsed_date := (transaction_item ->> 'transaction_date')::date;
      parsed_amount := (transaction_item ->> 'amount')::numeric;
    exception when others then
      raise exception 'Invalid finance transaction values'
        using errcode = '22023';
    end;

    if parsed_date < date '2000-01-01'
       or parsed_date > date '2100-12-31'
       or parsed_amount = 0
       or abs(parsed_amount) > 1000000000
       or length(coalesce(transaction_item ->> 'category', '')) > 80
       or length(coalesce(transaction_item ->> 'description', '')) > 500
       or length(coalesce(transaction_item ->> 'account', '')) > 120 then
      raise exception 'Finance transaction is outside the accepted range'
        using errcode = '22023';
    end if;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('finance-sync:' || p_user_id, 0)
  );

  insert into public.finance_transactions (
    user_id,
    source,
    external_key,
    transaction_date,
    amount,
    currency,
    category,
    description,
    account,
    metadata
  )
  select
    p_user_id,
    'google_sheets',
    item ->> 'external_key',
    (item ->> 'transaction_date')::date,
    (item ->> 'amount')::numeric,
    item ->> 'currency',
    nullif(item ->> 'category', ''),
    nullif(item ->> 'description', ''),
    nullif(item ->> 'account', ''),
    coalesce(item -> 'metadata', '{}'::jsonb)
  from pg_catalog.jsonb_array_elements(p_transactions) as input(item)
  on conflict (user_id, source, external_key) do update
  set
    transaction_date = excluded.transaction_date,
    amount = excluded.amount,
    currency = excluded.currency,
    category = excluded.category,
    description = excluded.description,
    account = excluded.account,
    metadata = excluded.metadata;

  get diagnostics upserted_rows = row_count;

  delete from public.finance_transactions as stored
  where stored.user_id = p_user_id
    and stored.source = 'google_sheets'
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_transactions) as input(item)
      where input.item ->> 'external_key' = stored.external_key
    );

  get diagnostics deleted_rows = row_count;

  return query select upserted_rows, deleted_rows;
end;
$function$;

revoke execute on function public.upsert_daily_activity(
  text, date, jsonb
) from public, anon, authenticated;
revoke execute on function public.sync_finance_transactions(
  text, jsonb
) from public, anon, authenticated;

grant execute on function public.upsert_daily_activity(
  text, date, jsonb
) to service_role;
grant execute on function public.sync_finance_transactions(
  text, jsonb
) to service_role;

commit;
