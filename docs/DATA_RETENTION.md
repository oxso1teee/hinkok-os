# Data retention policy

## Voice and photo media (`[P0-PRIV-01]`)

**The doc this checklist is derived from assumes raw voice/photo files are
probably retained indefinitely somewhere. That assumption is wrong for the
current architecture — verified by reading the actual capture pipeline, not
guessed.**

When a voice message or photo arrives via Telegram
(`src/lib/telegram/handler.ts` → `messageCaptureInput`):

1. The raw bytes are downloaded from Telegram once, in memory
   (`downloadTelegramFile` in `src/lib/telegram/client.ts`).
2. They're passed directly to Whisper transcription
   (`src/lib/media/transcription.ts`) or OpenAI Vision analysis
   (`src/lib/media/vision.ts`).
3. Once that call returns, the byte buffer is never referenced again and is
   garbage collected at the end of the request. **This application never
   writes voice/photo bytes to disk, to Supabase Storage, to any bucket, or
   to any other persistent store.** Confirmed by grepping the whole codebase
   for storage/file-write APIs (`supabase.storage`, `fs.writeFile`,
   `createWriteStream`) — there are none in the capture or media pipeline.

The only thing persisted is `raw_captures.media_file_id` — Telegram's own
opaque file identifier string (see
`supabase/migrations/202607180005_integrations.sql`), not the file content.
That reference exists so the capture record shows what kind of media
produced it; it cannot be used to re-download the file without this
project's own Telegram bot token.

**What this means in practice**:

- There is no "temporary media file cleanup" to build, because there is no
  persisted temporary media file in the first place.
- The original voice/photo file continues to exist on **Telegram's own
  servers**, governed by Telegram's own retention policy — entirely outside
  this application's control and not something it can query or purge.
  Deleting the message in Telegram is the only way to affect that copy.
- `raw_captures` rows (including the `media_file_id` reference and the
  transcribed/described text) are retained indefinitely alongside the rest
  of a user's capture history, by design — this is a personal
  journal/knowledge system, and indefinite retention of one's own notes is
  the intended behavior, not an oversight. There is no separate "expire
  after N days" policy for captures, tasks, journal entries, or any other
  application data; retention ends when the user deletes something
  (`[P1-PRIV-03]`, not yet built) or restores from an earlier backup.

## Third-party data flow (informational, not a P0 item — `[P2-PRIV-04]`)

For context, since it's directly relevant to the media-retention question
above: raw capture text goes to OpenAI (classification, embeddings, vision,
transcription); Google receives calendar event titles/times and finance
sheet rows if those integrations are connected; GitHub receives nothing from
this app (Obsidian sync only reads from a GitHub repo, it doesn't write
personal data there). No provider in this codebase's actual dependency
graph is Anthropic — see the `[P0-AI-01]` changelog entry for the doc/code
discrepancy that clarifies this (the release doc assumed an Anthropic step
that doesn't exist in the shipped code).
