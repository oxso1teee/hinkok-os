begin;

create table if not exists public.personal_settings (
  user_id text primary key,
  display_name text not null,
  focus_statement text not null,
  habits jsonb not null,
  nutrition_targets jsonb not null,
  sphere_info jsonb not null,
  obsidian_folder_mapping jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_settings_user_id_check
    check (length(btrim(user_id)) between 1 and 128),
  constraint personal_settings_display_name_check
    check (length(btrim(display_name)) between 1 and 60),
  constraint personal_settings_focus_statement_check
    check (length(btrim(focus_statement)) between 1 and 120),
  constraint personal_settings_habits_check
    check (
      jsonb_typeof(habits) = 'array'
      and jsonb_array_length(habits) between 1 and 12
      and octet_length(habits::text) <= 8192
    ),
  constraint personal_settings_nutrition_check
    check (
      jsonb_typeof(nutrition_targets) = 'object'
      and octet_length(nutrition_targets::text) <= 2048
    ),
  constraint personal_settings_sphere_info_check
    check (
      jsonb_typeof(sphere_info) = 'object'
      and octet_length(sphere_info::text) <= 16384
    ),
  constraint personal_settings_obsidian_mapping_check
    check (
      jsonb_typeof(obsidian_folder_mapping) = 'object'
      and octet_length(obsidian_folder_mapping::text) <= 16384
    )
);

drop trigger if exists personal_settings_set_updated_at
  on public.personal_settings;
create trigger personal_settings_set_updated_at
before update on public.personal_settings
for each row execute function public.set_updated_at();

alter table public.personal_settings enable row level security;

revoke all privileges on table public.personal_settings
from anon, authenticated;

grant select, insert, update, delete on table public.personal_settings
to service_role;

commit;
