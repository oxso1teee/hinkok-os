import { NextRequest, NextResponse } from "next/server";

import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import { totpAuthUri } from "@/lib/auth/totp";
import { getTotpStatus, startTotpSetup } from "@/lib/auth/totp-storage";
import { serverEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authentication = authenticateRequest(request);
  if (!authentication.authenticated) {
    return response(401, { ok: false, error: "unauthorized" });
  }

  const status = await getTotpStatus();
  return response(200, { ok: true, enabled: status.enabled });
}

/** Starts (or restarts) TOTP setup: a new pending secret, not yet enabled. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const authentication = authenticateRequest(request);
  if (!authentication.authenticated) {
    return response(401, { ok: false, error: "unauthorized" });
  }
  if (authentication.method === "session" && !hasSameOrigin(request)) {
    return response(403, { ok: false, error: "invalid_request" });
  }

  const status = await getTotpStatus();
  if (status.enabled) {
    return response(409, { ok: false, error: "already_enabled" });
  }

  const secret = await startTotpSetup();

  return response(200, {
    ok: true,
    secret,
    otpauthUri: totpAuthUri(secret, serverEnv.USER_ID),
  });
}
