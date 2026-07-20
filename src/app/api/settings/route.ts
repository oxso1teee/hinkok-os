import { NextRequest, NextResponse } from "next/server";

import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import { serverEnv } from "@/lib/env/server";
import { readBoundedJsonBody } from "@/lib/http/json-body";
import { consumeRateLimit } from "@/lib/rate-limit";
import { personalSettingsSchema } from "@/lib/settings/normalize";
import { savePersonalSettings } from "@/lib/settings/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32_768;

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
  if (!authentication.authenticated) {
    return response(401, { ok: false, error: "unauthorized" });
  }
  if (authentication.method === "session" && !hasSameOrigin(request)) {
    return response(403, { ok: false, error: "invalid_request" });
  }

  try {
    const body = await readBoundedJsonBody(request, MAX_BODY_BYTES);
    if (!body.ok) return response(400, { ok: false, error: "invalid_request" });
    const parsed = personalSettingsSchema.safeParse(body.value);
    if (!parsed.success) {
      return response(400, { ok: false, error: "invalid_settings" });
    }

    const allowed = await consumeRateLimit({
      bucket: `settings:update:${serverEnv.USER_ID}:${authentication.method}`,
      windowSeconds: 300,
      maxRequests: 10,
    });
    if (!allowed) return response(429, { ok: false, error: "rate_limited" });

    await savePersonalSettings(parsed.data);
    return response(200, { ok: true });
  } catch (error: unknown) {
    console.error("Personal settings update failed", error);
    return response(503, { ok: false, error: "unavailable" });
  }
}
