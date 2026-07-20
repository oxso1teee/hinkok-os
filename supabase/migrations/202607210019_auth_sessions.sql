begin;

create table if not exists public.auth_sessions (
  session_id uuid primary key,
  user_id text not null,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint auth_sessions_user_id_check
    check (length(btrim(user_id)) between 1 and 128),
  constraint auth_sessions_ip_check
    check (ip is null or length(ip) <= 128),
  constraint auth_sessions_user_agent_check
    check (user_agent is null or length(user_agent) <= 512)
);

create index if not exists auth_sessions_user_id_expires_idx
  on public.auth_sessions (user_id, expires_at desc);

alter table public.auth_sessions enable row level security;

revoke all privileges on table public.auth_sessions
from anon, authenticated;

grant select, insert, update, delete on table public.auth_sessions
to service_role;

-- Revokes every non-revoked, non-expired session for a user except one,
-- atomically, and returns how many were revoked (for UI feedback).
create or replace function public.revoke_other_sessions(
  p_user_id text,
  p_keep_session_id uuid
)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  revoked_count integer;
begin
  if p_user_id is null or length(btrim(p_user_id)) < 1 or length(p_user_id) > 128 then
    raise exception 'Invalid session user id' using errcode = '22023';
  end if;

  update public.auth_sessions
  set revoked_at = now()
  where user_id = p_user_id
    and session_id <> p_keep_session_id
    and revoked_at is null
    and expires_at > now();

  get diagnostics revoked_count = row_count;
  return revoked_count;
end;
$function$;

revoke execute on function public.revoke_other_sessions(text, uuid)
from public, anon, authenticated;

grant execute on function public.revoke_other_sessions(text, uuid)
to service_role;

commit;
