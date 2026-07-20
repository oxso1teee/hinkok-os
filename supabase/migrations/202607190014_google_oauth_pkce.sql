create table if not exists public.google_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  state_hash text not null,
  encrypted_code_verifier text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint google_oauth_states_state_hash_unique unique (state_hash),
  constraint google_oauth_states_user_id_check check (length(btrim(user_id)) between 1 and 128),
  constraint google_oauth_states_state_hash_check check (length(state_hash) between 40 and 128),
  constraint google_oauth_states_verifier_check check (length(encrypted_code_verifier) between 40 and 1024)
);

create index if not exists google_oauth_states_expiry_idx
  on public.google_oauth_states (expires_at);

alter table public.google_oauth_states enable row level security;
revoke all on public.google_oauth_states from public, anon, authenticated;
grant select, insert, update, delete on public.google_oauth_states to service_role;

create or replace function public.consume_google_oauth_state(
  p_user_id text,
  p_state_hash text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  verifier text;
begin
  delete from public.google_oauth_states
  where user_id = p_user_id
    and state_hash = p_state_hash
    and expires_at >= now()
  returning encrypted_code_verifier into verifier;

  delete from public.google_oauth_states
  where expires_at < now();

  return verifier;
end;
$$;

revoke all on function public.consume_google_oauth_state(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_google_oauth_state(text, text)
  to service_role;
