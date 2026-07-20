import { NextRequest, NextResponse } from "next/server";

import { recordAuthAudit } from "@/lib/auth/audit";
import { getClientIp } from "@/lib/auth/login-attempts";
import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import {
  expiredSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { revokeSession } from "@/lib/auth/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!hasSameOrigin(request)) {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const authentication = await authenticateRequest(request);

  if (authentication.method === "session") {
    await revokeSession(authentication.session.sessionId);

    try {
      await recordAuthAudit("auth.logout", {
        ip: getClientIp(request),
        sessionIssuedAt: new Date(
          authentication.session.issuedAt * 1000,
        ).toISOString(),
      });
    } catch (error: unknown) {
      console.error("Unable to record logout audit event", error);
    }
  }

  const response = new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });

  response.cookies.set(
    SESSION_COOKIE_NAME,
    "",
    expiredSessionCookieOptions(),
  );

  return response;
}
