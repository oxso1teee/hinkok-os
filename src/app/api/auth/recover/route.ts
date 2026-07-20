import { randomBytes } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { recordAuthAudit } from "@/lib/auth/audit";
import { constantTimeStringEqual } from "@/lib/auth/constant-time";
import { enforceMinimumLoginTime, getClientIp } from "@/lib/auth/login-attempts";
import { hasSameOrigin } from "@/lib/auth/origin";
import { hashPassword } from "@/lib/auth/password-hash";
import { setPasswordOverride } from "@/lib/auth/password-override";
import { isRecoveryConfigured, recoveryEnv } from "@/lib/env/recovery";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_096;
const RECOVERY_WINDOW_SECONDS = 3_600;
const RECOVERY_MAX_ATTEMPTS = 3;

const recoverBodySchema = z.object({
  recoveryCode: z.string().min(1).max(512),
});

function errorResponse(
  status: number,
  code: "not_configured" | "invalid_request" | "invalid_code" | "rate_limited" | "unavailable",
): NextResponse {
  const response = NextResponse.json({ ok: false, error: code }, { status });
  response.headers.set("Cache-Control", "no-store");
  if (status === 429) response.headers.set("Retry-After", String(RECOVERY_WINDOW_SECONDS));
  return response;
}

/**
 * Break-glass password recovery: a separate, high-entropy RECOVERY_CODE
 * (generated once via scripts/generate-secrets.mjs, kept only by the owner)
 * authorizes minting a brand-new random password without ever touching
 * DASHBOARD_PASSWORD or redeploying. The new password's hash is stored in
 * auth_password_override and takes priority over DASHBOARD_PASSWORD on the
 * next login (see src/app/api/auth/login/route.ts).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAtMs = Date.now();
  const ip = getClientIp(request);

  try {
    if (!isRecoveryConfigured()) {
      await enforceMinimumLoginTime(startedAtMs);
      return errorResponse(503, "not_configured");
    }

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
      contentLength > MAX_BODY_BYTES
    ) {
      await enforceMinimumLoginTime(startedAtMs);
      return errorResponse(400, "invalid_request");
    }

    const allowed = await consumeRateLimit({
      bucket: `auth:recover:${ip}`,
      windowSeconds: RECOVERY_WINDOW_SECONDS,
      maxRequests: RECOVERY_MAX_ATTEMPTS,
    });

    if (!allowed) {
      await enforceMinimumLoginTime(startedAtMs);
      return errorResponse(429, "rate_limited");
    }

    let untrustedBody: unknown;
    try {
      untrustedBody = await request.json();
    } catch {
      await enforceMinimumLoginTime(startedAtMs);
      return errorResponse(400, "invalid_request");
    }

    const body = recoverBodySchema.safeParse(untrustedBody);
    if (!body.success) {
      await enforceMinimumLoginTime(startedAtMs);
      return errorResponse(400, "invalid_request");
    }

    const codeMatches =
      typeof recoveryEnv.RECOVERY_CODE === "string" &&
      constantTimeStringEqual(body.data.recoveryCode, recoveryEnv.RECOVERY_CODE);

    if (!codeMatches) {
      await enforceMinimumLoginTime(startedAtMs);
      return errorResponse(401, "invalid_code");
    }

    const newPassword = randomBytes(18).toString("base64url");
    const hash = await hashPassword(newPassword);
    await setPasswordOverride(hash);

    await recordAuthAudit("auth.password_recovered", { ip });
    await enforceMinimumLoginTime(startedAtMs);

    const response = NextResponse.json({ ok: true, newPassword }, { status: 200 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error: unknown) {
    console.error("Password recovery request failed", error);
    await enforceMinimumLoginTime(startedAtMs);
    return errorResponse(503, "unavailable");
  }
}
