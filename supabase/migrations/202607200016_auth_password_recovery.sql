begin;

create table if not exists public.auth_password_override (
  user_id text primary key,
  password_hash text not null,
  password_salt text not null,
  password_scrypt_cost integer not null,
  recovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_password_override_user_id_check
    check (length(btrim(user_id)) between 1 and 128),
  constraint auth_password_override_password_hash_check
    check (length(password_hash) between 32 and 512),
  constraint auth_password_override_password_salt_check
    check (length(password_salt) between 16 and 512),
  constraint auth_password_override_scrypt_cost_check
    check (password_scrypt_cost between 1024 and 1048576)
);

drop trigger if exists auth_password_override_set_updated_at
  on public.auth_password_override;
create trigger auth_password_override_set_updated_at
before update on public.auth_password_override
for each row execute function public.set_updated_at();

alter table public.auth_password_override enable row level security;

revoke all privileges on table public.auth_password_override
from anon, authenticated;

grant select, insert, update, delete on table public.auth_password_override
to service_role;

commit;
