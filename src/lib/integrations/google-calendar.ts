import "server-only";

import { google, type calendar_v3 } from "googleapis";
import type { CaptureClassification } from "@/lib/capture/schema";
import { googleEnv, isGoogleCalendarConfigured } from "@/lib/env/google";
import { serverEnv } from "@/lib/env/server";
import { getGoogleAuth } from "@/lib/integrations/google-auth";
import { completeCalendarRoute } from "@/lib/integrations/repository";
import { db } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

type CalendarSyncResult =
  | { status: "not_applicable" | "pending"; externalRef: null }
  | { status: "synced"; externalRef: string };

export type HomeCalendarEvent = { id: string; title: string; start: string; end: string | null; allDay: boolean };
export type GoogleCalendarPullResult = { upserted: number; deleted: number; fullSync: boolean; nextSyncToken: string | null };

async function calendar() {
  const auth = await getGoogleAuth(["https://www.googleapis.com/auth/calendar"]);
  return google.calendar({ version: "v3", auth: auth as never });
}

function isConflict(error: unknown): boolean {
  const candidate = error as { code?: unknown; response?: { status?: unknown } } | null;
  return candidate?.code === 409 || candidate?.response?.status === 409;
}

function isInvalidSyncToken(error: unknown): boolean {
  const candidate = error as { code?: unknown; response?: { status?: unknown } } | null;
  return candidate?.code === 410 || candidate?.response?.status === 410;
}

function normalizedCalendarId(): string {
  return googleEnv.GOOGLE_CALENDAR_ID ?? "primary";
}

export async function syncCaptureToGoogleCalendar(captureId: string, classification: CaptureClassification): Promise<CalendarSyncResult> {
  if (classification.kind !== "event") return { status: "not_applicable", externalRef: null };
  if (!classification.event_start || !isGoogleCalendarConfigured()) return { status: "pending", externalRef: null };
  const eventId = captureId.replace(/-/g, "").toLowerCase();
  const startMs = Date.parse(classification.event_start);
  if (!Number.isFinite(startMs)) return { status: "pending", externalRef: null };
  const eventEnd = classification.event_end ?? new Date(startMs + 60 * 60 * 1000).toISOString();
  try {
    const client = await calendar();
    await client.events.insert({
      calendarId: normalizedCalendarId(), sendUpdates: "none",
      requestBody: {
        id: eventId, summary: classification.title,
        description: `${classification.summary}\n\nHinkoK OS capture: ${captureId}`,
        start: { dateTime: classification.event_start, timeZone: serverEnv.USER_TIMEZONE },
        end: { dateTime: eventEnd, timeZone: serverEnv.USER_TIMEZONE },
        extendedProperties: { private: { hinkokCaptureId: captureId } },
      },
    });
  } catch (error) {
    if (!isConflict(error)) throw new Error("Google Calendar event creation failed", { cause: error });
  }
  await completeCalendarRoute(captureId, eventId);
  return { status: "synced", externalRef: eventId };
}

function calendarRow(event: calendar_v3.Schema$Event, calendarId: string) {
  if (!event.id) return null;
  const allDay = Boolean(event.start?.date && !event.start?.dateTime);
  const title = event.summary?.replace(/\s+/g, " ").trim().slice(0, 500) || "Без названия";
  if (!allDay && !event.start?.dateTime) return null;
  if (allDay && !event.start?.date) return null;
  return {
    user_id: serverEnv.USER_ID, google_event_id: event.id, calendar_id: calendarId, title,
    description: event.description?.slice(0, 20_000) ?? null, location: event.location?.slice(0, 1_000) ?? null,
    start_at: allDay ? null : event.start?.dateTime ?? null, end_at: allDay ? null : event.end?.dateTime ?? null,
    start_date: allDay ? event.start?.date ?? null : null, end_date: allDay ? event.end?.date ?? null : null,
    all_day: allDay, status: event.status === "cancelled" || event.status === "tentative" ? event.status : "confirmed",
    html_link: event.htmlLink ?? null, etag: event.etag ?? null,
    metadata: { organizer: event.organizer?.email ?? null, attendees: event.attendees?.length ?? 0, recurringEventId: event.recurringEventId ?? null } as Json,
  };
}

async function storedSyncToken(): Promise<string | null> {
  const { data } = await db().from("google_oauth_connections").select("calendar_sync_token").eq("user_id", serverEnv.USER_ID).eq("provider", "google").maybeSingle();
  return data?.calendar_sync_token ?? null;
}

async function saveSyncToken(token: string | null): Promise<void> {
  if (!token) return;
  const { error } = await db().from("google_oauth_connections").upsert({
    user_id: serverEnv.USER_ID,
    provider: "google",
    calendar_sync_token: token,
    connected_email: googleEnv.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null,
  }, { onConflict: "user_id,provider" });
  if (error) throw new Error("Unable to save Google Calendar sync token", { cause: error });
}

export async function syncGoogleCalendar(options: { forceFull?: boolean } = {}): Promise<GoogleCalendarPullResult> {
  if (!isGoogleCalendarConfigured()) throw new Error("Google Calendar is not configured");
  const client = await calendar();
  const calendarId = normalizedCalendarId();
  let syncToken = options.forceFull ? null : await storedSyncToken();
  let fullSync = !syncToken;
  let pageToken: string | undefined;
  let upserted = 0;
  let deleted = 0;
  let nextSyncToken: string | null = null;

  const run = async () => {
    do {
      const response = await client.events.list({
        calendarId, singleEvents: true, showDeleted: true, maxResults: 2500, pageToken,
        ...(syncToken ? { syncToken } : { timeMin: new Date(Date.now() - 90 * 86400_000).toISOString(), timeMax: new Date(Date.now() + 365 * 86400_000).toISOString(), timeZone: serverEnv.USER_TIMEZONE }),
      }, { timeout: 45_000, retry: true, retryConfig: { retry: 2 } });
      for (const event of response.data.items ?? []) {
        if (!event.id) continue;
        if (event.status === "cancelled") {
          const { error } = await db().from("google_calendar_events").delete().eq("user_id", serverEnv.USER_ID).eq("calendar_id", calendarId).eq("google_event_id", event.id);
          if (error) throw error;
          deleted += 1;
          continue;
        }
        const row = calendarRow(event, calendarId);
        if (!row) continue;
        const { error } = await db().from("google_calendar_events").upsert(row, { onConflict: "user_id,calendar_id,google_event_id" });
        if (error) throw error;
        upserted += 1;
      }
      pageToken = response.data.nextPageToken ?? undefined;
      nextSyncToken = response.data.nextSyncToken ?? nextSyncToken;
    } while (pageToken);
  };

  try { await run(); }
  catch (error) {
    if (!syncToken || !isInvalidSyncToken(error)) throw new Error("Google Calendar synchronization failed", { cause: error });
    syncToken = null; fullSync = true; pageToken = undefined; upserted = 0; deleted = 0; nextSyncToken = null;
    await run();
  }
  await saveSyncToken(nextSyncToken);
  return { upserted, deleted, fullSync, nextSyncToken };
}

export async function listUpcomingGoogleCalendarEvents(now = new Date(), days = 14): Promise<HomeCalendarEvent[]> {
  const max = new Date(now.getTime() + days * 86400_000).toISOString();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: serverEnv.USER_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [timed, allDay] = await Promise.all([
    db().from("google_calendar_events").select("google_event_id,title,start_at,end_at").eq("user_id", serverEnv.USER_ID).eq("all_day", false).gte("start_at", now.toISOString()).lte("start_at", max).order("start_at").limit(100),
    db().from("google_calendar_events").select("google_event_id,title,start_date,end_date").eq("user_id", serverEnv.USER_ID).eq("all_day", true).gte("start_date", today).order("start_date").limit(100),
  ]);
  if (timed.error || allDay.error) throw new Error("Unable to read synchronized calendar", { cause: timed.error ?? allDay.error });
  return [
    ...(timed.data ?? []).map((event) => ({ id: event.google_event_id, title: event.title, start: event.start_at!, end: event.end_at, allDay: false })),
    ...(allDay.data ?? []).map((event) => ({ id: event.google_event_id, title: event.title, start: event.start_date!, end: event.end_date, allDay: true })),
  ].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 100);
}
