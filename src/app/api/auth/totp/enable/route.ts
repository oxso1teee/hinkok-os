import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import { confirmTotpSetup } from "@/lib/auth/totp-storage";
import { readBoundedJsonBody } from "@/lib/http/json-body";
import { consumeRateLimit } from "@/lib/rate-limit";
import { serverEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_024;
const enableBodySchema = z.object({ code: z.string().min(1).max(16) });

function response(status: number, body: Record<string, unknown>): NextResponse {
  const result = NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (status === 429) result.headers.set("Retry-After", "300");
  return result;
}

/** Confirms TOTP setup with a code from the authenticator app; enables it. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authentication = await authenticateRequest(request);
  if (!authentication.authenticated) {
    return response(401, { ok: false, error: "unauthorized" });
  }
  if (authentication.method === "session" && !hasSameOrigin(request)) {
    return response(403, { ok: false, error: "invalid_request" });
  }

  const allowed = await consumeRateLimit({
    bucket: `auth:totp:enable:${serverEnv.USER_ID}`,
    windowSeconds: 300,
    maxRequests: 10,
  });
  if (!allowed) return response(429, { ok: false, error: "rate_limited" });

  const body = await readBoundedJsonBody(request, MAX_BODY_BYTES);
  if (!body.ok) return response(400, { ok: false, error: "invalid_request" });

  const parsed = enableBodySchema.safeParse(body.value);
  if (!parsed.success) return response(400, { ok: false, error: "invalid_request" });

  const confirmed = await confirmTotpSetup(parsed.data.code);
  if (!confirmed) return response(401, { ok: false, error: "invalid_code" });

  return response(200, { ok: true });
}
