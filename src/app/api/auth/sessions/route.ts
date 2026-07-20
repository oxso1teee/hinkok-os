import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/request";
import { listActiveSessions } from "@/lib/auth/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authentication = await authenticateRequest(request);
  if (!authentication.authenticated) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const sessions = await listActiveSessions();
  const currentSessionId =
    authentication.method === "session" ? authentication.session.sessionId : null;

  return NextResponse.json(
    {
      ok: true,
      sessions: sessions.map((session) => ({
        ...session,
        isCurrent: session.sessionId === currentSessionId,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
