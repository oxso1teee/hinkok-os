import { NextRequest, NextResponse } from "next/server";

import { hasValidCronAuthorization } from "@/lib/auth/cron";
import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import { cronEnv } from "@/lib/env/cron";
import { isObsidianConfigured } from "@/lib/env/obsidian";
import { serverEnv } from "@/lib/env/server";
import { syncObsidianMemory } from "@/lib/obsidian/sync";
import { withObservedJob } from "@/lib/operations/jobs";
import type { SystemJobTrigger } from "@/lib/operations/normalize";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function response(status: number, body: Record<string, unknown>): NextResponse {
  const result = NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

  if (status === 429) {
    result.headers.set("Retry-After", "300");
  }

  return result;
}

async function runSync(trigger: SystemJobTrigger): Promise<NextResponse> {
  if (!isObsidianConfigured()) {
    return response(503, { ok: false, error: "unavailable" });
  }

  try {
    if (trigger === "manual") {
      const allowed = await consumeRateLimit({
        bucket: `obsidian:sync:${serverEnv.USER_ID}`,
        windowSeconds: 300,
        maxRequests: 1,
      });

      if (!allowed) {
        return response(429, { ok: false, error: "rate_limited" });
      }
    }

    const observed = await withObservedJob({
      jobName: "obsidian_sync",
      trigger,
      execute: syncObsidianMemory,
      summarize: (result) => ({
        status: result.status,
        noteCount: result.noteCount,
        changedCount: result.changedCount,
        removedCount: result.removedCount,
        indexedCount: result.indexedCount,
        embeddedCount: result.embeddedCount,
      }),
    });
    if (observed.skipped) {
      return response(200, { ok: true, skipped: observed.reason });
    }
    return response(200, { ok: true, ...observed.value });
  } catch (error: unknown) {
    console.error("Obsidian memory sync failed", error);
    return response(503, { ok: false, error: "unavailable" });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!cronEnv.CRON_SECRET) {
    return response(503, { ok: false, error: "unavailable" });
  }

  if (!hasValidCronAuthorization(request)) {
    return response(401, { ok: false, error: "unauthorized" });
  }

  return runSync("cron");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authentication = await authenticateRequest(request);

  if (!authentication.authenticated) {
    return response(401, { ok: false, error: "unauthorized" });
  }

  if (authentication.method === "session" && !hasSameOrigin(request)) {
    return response(403, { ok: false, error: "invalid_request" });
  }

  return runSync("manual");
}
