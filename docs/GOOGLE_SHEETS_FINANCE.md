# Google Sheets finance source

HinkoK OS treats the configured sheet range as the complete source of truth for
Google Sheets transactions. Each successful synchronization upserts current
rows and removes locally synchronized rows that no longer exist in the sheet.
If any non-empty row is invalid, nothing is changed in Supabase.

## Sheet format

The first row must contain headers. `date` and `amount` are required; all other
columns are optional.

| English header | Russian header | Value |
| --- | --- | --- |
| `date` | `дата` | `YYYY-MM-DD`, `DD.MM.YYYY` or `DD/MM/YYYY` |
| `amount` | `сумма` | Non-zero amount; negative values represent expenses |
| `currency` | `валюта` | Three-letter ISO-style code such as `EUR` |
| `category` | `категория` | Up to 80 characters |
| `description` / `comment` | `описание` / `комментарий` | Up to 500 characters |
| `account` | `счёт` | Up to 120 characters |
| `type` | `тип` | `income` / `expense` or `доход` / `расход`; normalizes the amount sign |
| `external_id` / `id` | `идентификатор` | Stable unique transaction identifier |

Example:

| date | amount | type | currency | category | description | account | external_id |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| 2026-07-18 | 49.90 | expense | EUR | Software | AI subscription | Business | bank-001 |
| 2026-07-18 | 2500.00 | income | EUR | Revenue | Client payment | Business | bank-002 |

When `external_id` is omitted, HinkoK OS builds a deterministic SHA-256 key from
the normalized row. Explicit identifiers are recommended because they remain
stable when a transaction description is edited.

## Configuration

Enable Google Sheets API and configure an OAuth client, then connect from
`/api/integrations/google/connect`. A service account shared as a viewer remains
supported as a fallback.

```dotenv
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=https://YOUR_DOMAIN/api/integrations/google/callback
GOOGLE_SHEETS_FINANCE_ID=
GOOGLE_SHEETS_FINANCE_RANGE=Transactions!A:G
GOOGLE_SHEETS_FINANCE_DEFAULT_CURRENCY=EUR
CRON_SECRET=
```

The production cron runs daily at `03:15 UTC`. A trusted client may run the same
sync manually:

```bash
curl \
  --request POST \
  --header "x-api-secret: $API_SECRET" \
  https://YOUR_DOMAIN/api/finance/sync-google-sheets
```
