create table if not exists public.google_oauth_connections (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  provider text not null default 'google',
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expiry timestamptz,
  scopes text[] not null default '{}'::text[],
  calendar_sync_token text,
  connected_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_oauth_connections_user_provider_unique unique (user_id, provider),
  constraint google_oauth_connections_user_id_check check (length(btrim(user_id)) between 1 and 128),
  constraint google_oauth_connections_provider_check check (provider = 'google')
);

create table if not exists public.google_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  google_event_id text not null,
  calendar_id text not null,
  title text not null,
  description text,
  location text,
  start_at timestamptz,
  end_at timestamptz,
  start_date date,
  end_date date,
  all_day boolean not null default false,
  status text not null default 'confirmed',
  html_link text,
  etag text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_events_unique unique (user_id, calendar_id, google_event_id),
  constraint google_calendar_events_title_check check (length(title) between 1 and 500),
  constraint google_calendar_events_status_check check (status in ('confirmed','tentative','cancelled')),
  constraint google_calendar_events_dates_check check (
    (all_day and start_date is not null) or (not all_day and start_at is not null)
  )
);

create index if not exists google_calendar_events_user_start_idx
  on public.google_calendar_events (user_id, start_at);
create index if not exists google_calendar_events_user_start_date_idx
  on public.google_calendar_events (user_id, start_date);

alter table public.google_oauth_connections enable row level security;
alter table public.google_calendar_events enable row level security;
revoke all on public.google_oauth_connections, public.google_calendar_events from anon, authenticated;
grant select, insert, update, delete on public.google_oauth_connections, public.google_calendar_events to service_role;

create or replace function public.set_updated_at_google_integrations()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists google_oauth_connections_set_updated_at on public.google_oauth_connections;
create trigger google_oauth_connections_set_updated_at before update on public.google_oauth_connections
for each row execute function public.set_updated_at_google_integrations();

drop trigger if exists google_calendar_events_set_updated_at on public.google_calendar_events;
create trigger google_calendar_events_set_updated_at before update on public.google_calendar_events
for each row execute function public.set_updated_at_google_integrations();
