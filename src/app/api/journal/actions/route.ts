import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import { localCaptureTime } from "@/lib/capture/time";
import { serverEnv } from "@/lib/env/server";
import { saveJournalEntry, setJournalMood } from "@/lib/journal/repository";
import { readBoundedJsonBody } from "@/lib/http/json-body";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("mood"),
    mood: z.enum(["1", "2", "3", "4", "5"]),
  }).strict(),
  z.object({
    action: z.literal("save_entry"),
    text: z.string().trim().min(1).max(20_000),
  }).strict(),
]);

function response(status: number, body: Record<string, unknown>): NextResponse {
  const result = NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
  if (status === 429) result.headers.set("Retry-After", "300");
  return result;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authentication = await authenticateRequest(request);
  if (!authentication.authenticated) return response(401, { ok: false, error: "unauthorized" });
  if (authentication.method === "session" && !hasSameOrigin(request)) {
    return response(403, { ok: false, error: "invalid_request" });
  }

  try {
    const body = await readBoundedJsonBody(request, 24_576);
    if (!body.ok) return response(400, { ok: false, error: "invalid_request" });
    const parsed = actionSchema.safeParse(body.value);
    if (!parsed.success) return response(400, { ok: false, error: "invalid_request" });
    const allowed = await consumeRateLimit({
      bucket: `journal:actions:${serverEnv.USER_ID}:${authentication.method}`,
      windowSeconds: 300,
      maxRequests: 90,
    });
    if (!allowed) return response(429, { ok: false, error: "rate_limited" });

    const local = localCaptureTime(new Date(), serverEnv.USER_TIMEZONE);
    if (parsed.data.action === "mood") {
      const dailyLogId = await setJournalMood(local.date, parsed.data.mood);
      return response(200, { ok: true, dailyLogId });
    }

    const result = await saveJournalEntry(local.date, local.time, parsed.data.text);
    return response(200, { ok: true, ...result });
  } catch (error: unknown) {
    console.error("JOURNAL action failed", error);
    return response(503, { ok: false, error: "unavailable" });
  }
}
