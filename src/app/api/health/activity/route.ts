import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/request";
import { serverEnv } from "@/lib/env/server";
import {
  healthActivityMemoryText,
  healthActivityRequestSchema,
  normalizeHealthActivity,
} from "@/lib/health/activity";
import { storeDailyActivity } from "@/lib/health/repository";
import { readBoundedJsonBody } from "@/lib/http/json-body";
import { indexMemory } from "@/lib/memory/indexing";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BODY_BYTES = 8_192;

function response(status: number, body: Record<string, unknown>): NextResponse {
  const result = NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

  if (status === 429) {
    result.headers.set("Retry-After", "3600");
  }

  return result;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authentication = await authenticateRequest(request);

  if (!authentication.authenticated || authentication.method !== "api-secret") {
    return response(401, { ok: false, error: "unauthorized" });
  }

  try {
    const body = await readBoundedJsonBody(request, MAX_BODY_BYTES);

    if (!body.ok) {
      return response(400, { ok: false, error: "invalid_request" });
    }

    const parsed = healthActivityRequestSchema.safeParse(body.value);

    if (!parsed.success) {
      return response(400, { ok: false, error: "invalid_request" });
    }

    let activity;

    try {
      activity = normalizeHealthActivity(parsed.data);
    } catch {
      return response(400, { ok: false, error: "invalid_request" });
    }

    const allowed = await consumeRateLimit({
      bucket: `health:activity:${serverEnv.USER_ID}`,
      windowSeconds: 3_600,
      maxRequests: 60,
    });

    if (!allowed) {
      return response(429, { ok: false, error: "rate_limited" });
    }

    const dailyLogId = await storeDailyActivity(parsed.data.date, activity);
    let memoryIndexed = true;

    try {
      await indexMemory({
        sourceType: "health",
        sourceId: dailyLogId,
        sourceKey: `health:${parsed.data.date}`,
        text: healthActivityMemoryText(parsed.data.date, activity),
        metadata: {
          date: parsed.data.date,
          source: activity.source,
          sphere: "health",
          title: `Apple Health ${parsed.data.date}`,
        },
      });
    } catch (error: unknown) {
      memoryIndexed = false;
      console.error("Health activity memory indexing failed", error);
    }

    return response(200, {
      ok: true,
      date: parsed.data.date,
      dailyLogId,
      memoryIndexed,
    });
  } catch (error: unknown) {
    console.error("Health activity request failed", error);
    return response(503, { ok: false, error: "unavailable" });
  }
}
