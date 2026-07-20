import { NextRequest, NextResponse } from "next/server";

import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import { revokeOtherSessions } from "@/lib/auth/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authentication = await authenticateRequest(request);
  if (!authentication.authenticated) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (authentication.method === "session" && !hasSameOrigin(request)) {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (authentication.method !== "session") {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const revokedCount = await revokeOtherSessions(authentication.session.sessionId);

  return NextResponse.json(
    { ok: true, revokedCount },
    { headers: { "Cache-Control": "no-store" } },
  );
}
