import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { recordAuthAudit } from "@/lib/auth/audit";
import { constantTimeStringEqual } from "@/lib/auth/constant-time";
import {
  LOGIN_BACKOFF_BASE_MS,
  LOGIN_BACKOFF_MAX_MS,
  LOGIN_GLOBAL_MAX_FAILURES,
  LOGIN_MAX_BODY_BYTES,
  LOGIN_WINDOW_MINUTES,
} from "@/lib/auth/constants";
import {
  countRecentGlobalLoginFailures,
  enforceMinimumLoginTime,
  getClientIp,
  registerLoginAttempt,
  sleep,
} from "@/lib/auth/login-attempts";
import { maybeAlertOwnerOfLoginFailures } from "@/lib/auth/login-alert";
import { sanitizeNextPath } from "@/lib/auth/navigation";
import { hasSameOrigin } from "@/lib/auth/origin";
import { verifyPasswordHash } from "@/lib/auth/password-hash";
import { getPasswordOverride } from "@/lib/auth/password-override";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { serverEnv } from "@/lib/env/server";

/**
 * A recovered password (see /api/auth/recover) always wins over
 * DASHBOARD_PASSWORD once one has been set — that is the whole point of
 * recovery: rotate access without editing env vars or redeploying.
 */
async function checkPassword(candidate: string): Promise<boolean> {
  const override = await getPasswordOverride();
  if (override) return verifyPasswordHash(candidate, override);
  return constantTimeStringEqual(candidate, serverEnv.DASHBOARD_PASSWORD);
}

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

    const passwordMatches = await checkPassword(body.data.password);
    const loginAllowed = await registerLoginAttempt(ip, passwordMatches);

    if (!loginAllowed) {
      await enforceMinimumLoginTime(startedAtMs);
      return errorResponse(429, "rate_limited");
    }

    if (!passwordMatches) {
      // [P0-AUTH-04] Global (not just per-ip) lockout, exponential backoff and
      // an owner alert — closes the ip-rotation bypass of the per-ip gate
      // above, which only limits a single ip's failure count.
      const globalFailures = await countRecentGlobalLoginFailures();
      await maybeAlertOwnerOfLoginFailures(globalFailures, ip);

      if (globalFailures >= LOGIN_GLOBAL_MAX_FAILURES) {
        await enforceMinimumLoginTime(startedAtMs);
        return errorResponse(429, "rate_limited");
      }

      const backoffMs = Math.min(
        LOGIN_BACKOFF_BASE_MS * 2 ** Math.max(0, globalFailures - 1),
        LOGIN_BACKOFF_MAX_MS,
      );
      await sleep(backoffMs);
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
