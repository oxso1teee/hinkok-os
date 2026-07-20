begin;

create table if not exists public.auth_totp (
  user_id text primary key,
  secret_base32 text not null,
  enabled boolean not null default false,
  confirmed_at timestamptz,
  last_used_step bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_totp_user_id_check
    check (length(btrim(user_id)) between 1 and 128),
  constraint auth_totp_secret_check
    check (secret_base32 ~ '^[A-Z2-7]{16,64}$')
);

drop trigger if exists auth_totp_set_updated_at
  on public.auth_totp;
create trigger auth_totp_set_updated_at
before update on public.auth_totp
for each row execute function public.set_updated_at();

alter table public.auth_totp enable row level security;

revoke all privileges on table public.auth_totp
from anon, authenticated;

grant select, insert, update, delete on table public.auth_totp
to service_role;

-- Atomically checks and consumes a verified TOTP step for one user, so a
-- captured/observed code cannot be replayed even within its +/-1 step
-- tolerance window: once a step is used, it (and everything before it) is
-- rejected from then on.
create or replace function public.consume_totp_step(
  p_user_id text,
  p_step bigint
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  updated_rows integer;
begin
  if p_user_id is null or length(btrim(p_user_id)) < 1 or length(p_user_id) > 128 then
    raise exception 'Invalid TOTP user id' using errcode = '22023';
  end if;

  if p_step is null or p_step < 0 then
    raise exception 'Invalid TOTP step' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('auth_totp:' || p_user_id, 0)
  );

  update public.auth_totp
  set last_used_step = p_step
  where user_id = p_user_id
    and enabled = true
    and (last_used_step is null or last_used_step < p_step);

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$function$;

revoke execute on function public.consume_totp_step(text, bigint)
from public, anon, authenticated;

grant execute on function public.consume_totp_step(text, bigint)
to service_role;

commit;
