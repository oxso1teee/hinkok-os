import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { recordAuthAudit } from "@/lib/auth/audit";
import { constantTimeStringEqual } from "@/lib/auth/constant-time";
import {
  LOGIN_MAX_BODY_BYTES,
  LOGIN_WINDOW_MINUTES,
} from "@/lib/auth/constants";
import {
  enforceMinimumLoginTime,
  getClientIp,
  registerLoginAttempt,
} from "@/lib/auth/login-attempts";
import { sanitizeNextPath } from "@/lib/auth/navigation";
import { hasSameOrigin } from "@/lib/auth/origin";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { serverEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginBodySchema = z.object({
  password: z.string().min(1).max(256),
  next: z.string().max(2048).optional(),
});

function errorResponse(
  status: number,
  code:
    | "invalid_credentials"
    | "rate_limited"
    | "invalid_request"
    | "unavailable",
): NextResponse {
  const response = NextResponse.json(
    {
      ok: false,
      error: code,
    },
    { status },
  );

  response.headers.set("Cache-Control", "no-store");

  if (status === 429) {
    response.headers.set(
      "Retry-After",
      String(LOGIN_WINDOW_MINUTES * 60),
    );
  }

  return response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAtMs = Date.now();
  const ip = getClientIp(request);

  try {
    if (!hasSameOrigin(request)) {
      await enforceMinimumLoginTime(startedAtMs);
      return errorResponse(403, "invalid_request");
    }

    const contentType = request.headers.get("content-type") ?? "";
    const contentLength = Number(request.headers.get("content-length") ?? "0");

    if (
      !contentType.toLowerCase().startsWith("application/json") ||
      !Number.isFinite(contentLength) ||
      contentLength < 0 ||
      contentLength > LOGIN_MAX_BODY_BYTES
    ) {
      await enforceMinimumLoginTime(startedAtMs);
      return errorResponse(400, "invalid_request");
    }

    let untrustedBody: unknown;

    try {
      untrustedBody = await request.json();
    } catch {
      const allowed = await registerLoginAttempt(ip, false);
      await enforceMinimumLoginTime(startedAtMs);

      return allowed
        ? errorResponse(400, "invalid_request")
        : errorResponse(429, "rate_limited");
    }

    const body = loginBodySchema.safeParse(untrustedBody);

    if (!body.success) {
      const allowed = await registerLoginAttempt(ip, false);
      await enforceMinimumLoginTime(startedAtMs);

      return allowed
        ? errorResponse(401, "invalid_credentials")
        : errorResponse(429, "rate_limited");
    }

    const passwordMatches = constantTimeStringEqual(
      body.data.password,
      serverEnv.DASHBOARD_PASSWORD,
    );
    const loginAllowed = await registerLoginAttempt(ip, passwordMatches);

    if (!loginAllowed) {
      await enforceMinimumLoginTime(startedAtMs);
      return errorResponse(429, "rate_limited");
    }

    if (!passwordMatches) {
      await enforceMinimumLoginTime(startedAtMs);
      return errorResponse(401, "invalid_credentials");
    }

    const { token, payload } = createSessionToken();
    const nextPath = sanitizeNextPath(body.data.next);

    await recordAuthAudit("auth.login.success", {
      ip,
      userAgent: (request.headers.get("user-agent") ?? "unknown").slice(0, 512),
      expiresAt: new Date(payload.expiresAt * 1000).toISOString(),
    });

    const response = NextResponse.json(
      {
        ok: true,
        next: nextPath,
      },
      { status: 200 },
    );

    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(
      SESSION_COOKIE_NAME,
      token,
      sessionCookieOptions(payload.expiresAt),
    );

    return response;
  } catch (error: unknown) {
    console.error("Login request failed", error);
    await enforceMinimumLoginTime(startedAtMs);
    return errorResponse(503, "unavailable");
  }
}
