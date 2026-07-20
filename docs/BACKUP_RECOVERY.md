# HinkoK OS: encrypted backup and recovery

HinkoK OS exports one portable `.hinkok-backup` file encrypted with
AES-256-GCM. The encryption key is derived from a user-supplied passphrase with
`scrypt` (`N=32768`, `r=8`, `p=1`, random 128-bit salt). A random 96-bit IV is
used for every export. The envelope authenticates its format, KDF parameters,
IV and plaintext SHA-256 digest as GCM additional authenticated data.

The passphrase is never written to Supabase, cookies, local storage, the audit
log or the backup file. Losing it makes the backup unrecoverable.

## Snapshot contents

The snapshot contains every row for the configured `USER_ID` from:

1. `entities`
2. `raw_captures`
3. `tasks`
4. `daily_logs`
5. `finance_transactions`
6. `weekly_insights`
7. `memory_chunks`, including embeddings
8. `personal_settings`
9. `audit_log`

Ephemeral infrastructure state is intentionally excluded: login attempts, rate
limits, Telegram processing leases, cache snapshots and cron run locks. Those
records should be recreated by the running system, not restored as personal
history.

## Browser export

Open `/backup`, enter a unique passphrase of at least 16 characters twice and
press **CREATE ENCRYPTED BACKUP**. The route requires a valid HMAC session,
exact same-origin submission and a database rate limit of two exports per hour.

Vercel Functions limit response payloads to 4.5 MB. The browser route therefore
refuses plaintext snapshots above 3 MiB before encryption and directs the
operator to the local command. Base64 expansion stays inside the platform limit
with explicit headroom.

## Local export

Local export supports plaintext snapshots up to 64 MiB and never sends the
result through Vercel. Load the normal application environment in `.env.local`,
then read the backup passphrase without placing it in shell history:

```bash
read -rs HINKOK_BACKUP_PASSPHRASE
export HINKOK_BACKUP_PASSPHRASE
npm run backup:create -- backups/manual.hinkok-backup
unset HINKOK_BACKUP_PASSPHRASE
```

The command creates parent directories with mode `0700`, writes the file with
mode `0600` and refuses to overwrite an existing path. `backups/` and
`*.hinkok-backup` are ignored by Git.

## Offline verification

Verification decrypts the file in memory, checks the GCM tag, authenticated
header, SHA-256, exact table set, schema version, row bounds and per-row
`USER_ID`. It does not connect to or change the database:

```bash
read -rs HINKOK_BACKUP_PASSPHRASE
export HINKOK_BACKUP_PASSPHRASE
npm run backup:verify -- backups/manual.hinkok-backup
unset HINKOK_BACKUP_PASSPHRASE
```

If `.env.local` is present, verification additionally rejects a file whose
snapshot identity differs from its `USER_ID`.

## Recovery dry run

The restore command is non-mutating by default. It authenticates the file,
requires an exact match with the current `USER_ID` and prints the planned row
count for every table:

```bash
read -rs HINKOK_BACKUP_PASSPHRASE
export HINKOK_BACKUP_PASSPHRASE
npm run backup:restore -- backups/manual.hinkok-backup
unset HINKOK_BACKUP_PASSPHRASE
```

## Applying a recovery

Apply only after the dry run is correct and the target Supabase project has all
migrations through `202607180013_personal_settings.sql`:

```bash
read -rs HINKOK_BACKUP_PASSPHRASE
export HINKOK_BACKUP_PASSPHRASE
export HINKOK_RESTORE_CONFIRM=RESTORE
npm run backup:restore -- backups/manual.hinkok-backup --apply
unset HINKOK_BACKUP_PASSPHRASE HINKOK_RESTORE_CONFIRM
```

Both `--apply` and the exact `HINKOK_RESTORE_CONFIRM=RESTORE` value are required.
Rows are restored in dependency order with bounded, idempotent upsert batches.
The operation does not delete rows that were created after the backup. A final
privacy-preserving `backup.restored` event is appended to the audit log.

After recovery, run `npm run deploy:smoke`, open STATUS, regenerate one BRAIN
briefing and create a new encrypted backup. Keep at least two verified copies in
separate trusted locations.
