import "server-only";

import { NextResponse } from "next/server";

import { recordAuthAudit } from "@/lib/auth/audit";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth/session";

/** Shared by /api/auth/login (no TOTP) and /api/auth/totp/verify (with TOTP). */
export async function issueSessionResponse(
  nextPath: string,
  ip: string,
  userAgent: string,
): Promise<NextResponse> {
  const { token, payload } = createSessionToken();

  await recordAuthAudit("auth.login.success", {
    ip,
    userAgent: userAgent.slice(0, 512),
    expiresAt: new Date(payload.expiresAt * 1000).toISOString(),
  });

  const response = NextResponse.json({ ok: true, next: nextPath }, { status: 200 });
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(payload.expiresAt));

  return response;
}
