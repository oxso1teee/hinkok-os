# Google OAuth and Calendar synchronization

HinkoK OS uses OAuth 2.0 Authorization Code with PKCE for personal Google
accounts. The callback state is stored as a SHA-256 hash, expires after ten
minutes and can be consumed only once. Access tokens, refresh tokens and the
PKCE verifier are encrypted with AES-256-GCM before storage in Supabase.

## Google Cloud configuration

Enable Google Calendar API and Google Sheets API, create a Web OAuth client and
register this exact redirect URI:

```text
https://YOUR_DOMAIN/api/integrations/google/callback
```

Configure:

```dotenv
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_TIMEZONE=Europe/Riga
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=https://YOUR_DOMAIN/api/integrations/google/callback
GOOGLE_SHEETS_FINANCE_ID=
```

Apply migrations `202607190013_google_oauth_calendar.sql` and
`202607190014_google_oauth_pkce.sql` in filename order, sign in to the
HinkoK OS dashboard and open `/api/integrations/google/connect`.

The calendar cron calls `/api/cron/sync-calendar` every fifteen minutes. It uses
Google incremental sync tokens, falls back to a bounded full sync when Google
invalidates a token, and stores normalized events in `google_calendar_events`.
Cancelled events are removed from the local projection so deletions propagate
reliably.
