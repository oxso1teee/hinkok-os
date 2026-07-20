import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import { generateBrainBriefing } from "@/lib/brain/briefing";
import { serverEnv } from "@/lib/env/server";
import { readBoundedJsonBody } from "@/lib/http/json-body";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const schema = z.object({
  sphere: z.enum([
    "work",
    "finance",
    "health",
    "relationships",
    "growth",
    "mind",
    "personal",
    "content",
    "spirituality",
  ]),
}).strict();

function response(status: number, body: Record<string, unknown>): NextResponse {
  const result = NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
  if (status === 429) result.headers.set("Retry-After", "300");
  return result;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authentication = authenticateRequest(request);
  if (!authentication.authenticated) return response(401, { ok: false, error: "unauthorized" });
  if (authentication.method === "session" && !hasSameOrigin(request)) {
    return response(403, { ok: false, error: "invalid_request" });
  }

  try {
    const body = await readBoundedJsonBody(request, 2_048);
    if (!body.ok) return response(400, { ok: false, error: "invalid_request" });
    const parsed = schema.safeParse(body.value);
    if (!parsed.success) return response(400, { ok: false, error: "invalid_request" });
    const allowed = await consumeRateLimit({
      bucket: `brain:briefing:${serverEnv.USER_ID}:${authentication.method}`,
      windowSeconds: 300,
      maxRequests: 18,
    });
    if (!allowed) return response(429, { ok: false, error: "rate_limited" });

    const briefing = await generateBrainBriefing(parsed.data.sphere);
    return response(200, { ok: true, briefing });
  } catch (error: unknown) {
    console.error("BRAIN briefing failed", error);
    return response(503, { ok: false, error: "unavailable" });
  }
}
