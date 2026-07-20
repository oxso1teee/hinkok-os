# HinkoK OS: personal settings

The authenticated `/settings` page makes the configuration described in
section 12 of the original guide editable without changing source files.

## Database migration

Apply `supabase/migrations/202607180013_personal_settings.sql` before deploying
this version. It creates one `personal_settings` row per configured `USER_ID`.
The table has deny-all RLS for browser roles and is accessed only by the
server-side service-role client.

No row is required at startup. Until the first successful save, the application
uses the versioned defaults in `src/lib/settings/normalize.ts`. If a stored row
is unavailable or fails strict normalization, the entire snapshot falls back
to those coherent defaults instead of mixing trusted and malformed fields.

## Editable fields

- operator display name and current focus statement;
- 1–12 daily habits, each with an immutable internal id, label, eyebrow and
  integer target from 1 to 10;
- daily calorie, protein, carbohydrate and fat targets;
- labels and descriptions for all nine life spheres;
- up to 100 single-folder-name Obsidian mapping rules.

The internal sphere ids remain fixed: `work`, `finance`, `health`,
`relationships`, `growth`, `mind`, `personal`, `content` and `spirituality`.
Keeping those ids stable preserves database constraints, classifier output,
task filters, memory metadata and historical records. Only their user-facing
meaning changes.

## Security and validation

The settings endpoint requires a valid HMAC session or API secret. Browser
writes additionally require an exact same-origin request. The JSON body is
limited to 32 KiB, the update rate is limited in Supabase, every nested field is
allow-listed, and the mutation is recorded in `audit_log` without storing the
actual settings content.

Folder names are normalized to NFC lowercase segments. Empty names, traversal,
slashes, backslashes, NUL characters and more than 100 rules are rejected.
Descriptions are plain bounded data and never modify the fixed classification
enums.

## Where settings apply

- HOME uses the configured display name, focus, habits and nutrition targets.
- HOME habit mutations accept only ids from the current saved settings.
- BRAIN uses the configured sphere labels and descriptions in the interface and
  in new operational briefings.
- Obsidian sync maps every folder segment using the configured rules, falling
  back to `personal` when no rule matches.

The Obsidian mapping has a deterministic fingerprint stored with the sync
snapshot. Editing a mapping changes that fingerprint, so the next sync safely
re-evaluates existing notes even when the Git tree SHA did not change.

## Restore defaults

**RESTORE DEFAULTS** changes only the local form. Review the values and press
**SAVE SETTINGS** to persist them. Existing daily-log habit keys and historical
memory records are not deleted; removed habits simply stop appearing in HOME.
