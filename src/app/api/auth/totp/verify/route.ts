import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  LOGIN_MAX_BODY_BYTES,
  LOGIN_WINDOW_MINUTES,
} from "@/lib/auth/constants";
import { issueSessionResponse } from "@/lib/auth/issue-session";
import {
  enforceMinimumLoginTime,
  getClientIp,
  registerLoginAttempt,
} from "@/lib/auth/login-attempts";
import { sanitizeNextPath } from "@/lib/auth/navigation";
import { hasSameOrigin } from "@/lib/auth/origin";
import { verifyPendingLoginToken } from "@/lib/auth/pending-login";
import { verifyAndConsumeLoginTotpCode } from "@/lib/auth/totp-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const verifyBodySchema = z.object({
  pendingToken: z.string().min(1).max(1024),
  code: z.string().min(1).max(16),
  next: z.string().max(2048).optional(),
});

function errorResponse(
  status: number,
  code: "invalid_code" | "rate_limited" | "invalid_request" | "unavailable",
): NextResponse {
  const response = NextResponse.json({ ok: false, error: code }, { status });
  response.headers.set("Cache-Control", "no-store");
  if (status === 429) {
    response.headers.set("Retry-After", String(LOGIN_WINDOW_MINUTES * 60));
  }
  return response;
}

/**
 * Completes a login that /api/auth/login paused because TOTP is enabled.
 * Reuses the same per-ip login-attempt gate as the password step so a code
 * cannot be brute-forced any more freely than a password can.
 */
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
      await enforceMinimumLoginTime(startedAtMs);
      return errorResponse(400, "invalid_request");
    }

    const body = verifyBodySchema.safeParse(untrustedBody);
    if (!body.success) {
      await enforceMinimumLoginTime(startedAtMs);
      return errorResponse(400, "invalid_request");
    }

    if (!verifyPendingLoginToken(body.data.pendingToken)) {
      const allowed = await registerLoginAttempt(ip, false);
      await enforceMinimumLoginTime(startedAtMs);
      return allowed
        ? errorResponse(401, "invalid_code")
        : errorResponse(429, "rate_limited");
    }

    const codeMatches = await verifyAndConsumeLoginTotpCode(body.data.code);
    const loginAllowed = await registerLoginAttempt(ip, codeMatches);

    if (!loginAllowed) {
      await enforceMinimumLoginTime(startedAtMs);
      return errorResponse(429, "rate_limited");
    }

    if (!codeMatches) {
      await enforceMinimumLoginTime(startedAtMs);
      return errorResponse(401, "invalid_code");
    }

    const nextPath = sanitizeNextPath(body.data.next);
    return await issueSessionResponse(
      nextPath,
      ip,
      request.headers.get("user-agent") ?? "unknown",
    );
  } catch (error: unknown) {
    console.error("TOTP verification request failed", error);
    await enforceMinimumLoginTime(startedAtMs);
    return errorResponse(503, "unavailable");
  }
}
