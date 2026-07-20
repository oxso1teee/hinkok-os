import { NextRequest, NextResponse } from "next/server";
import { hasValidCronAuthorization } from "@/lib/auth/cron";
import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import { isGoogleCalendarConfigured } from "@/lib/env/google";
import { syncGoogleCalendar } from "@/lib/integrations/google-calendar";
import { withObservedJob } from "@/lib/operations/jobs";
import type { SystemJobTrigger } from "@/lib/operations/normalize";
import { consumeRateLimit } from "@/lib/rate-limit";
import { serverEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function run(trigger: SystemJobTrigger): Promise<NextResponse> {
  if (!isGoogleCalendarConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  if (trigger === "manual" && !(await consumeRateLimit({ bucket: `calendar-sync:${serverEnv.USER_ID}`, windowSeconds: 60, maxRequests: 1 }))) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  try {
    const observed = await withObservedJob({
      jobName: "calendar_sync",
      trigger,
      execute: () => syncGoogleCalendar({ forceFull: false }),
      summarize: (result) => ({
        upserted: result.upserted,
        deleted: result.deleted,
        fullSync: result.fullSync,
      }),
    });
    if (observed.skipped) return NextResponse.json({ ok: true, skipped: observed.reason });
    return NextResponse.json({ ok: true, ...observed.value });
  }
  catch (cause) { console.error("Google Calendar sync failed", cause); return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 }); }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!hasValidCronAuthorization(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return run("cron");
}
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (auth.method === "session" && !hasSameOrigin(request)) return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  return run("manual");
}
