import { NextRequest, NextResponse } from "next/server";

import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import { disableTotp } from "@/lib/auth/totp-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authentication = await authenticateRequest(request);
  if (!authentication.authenticated) {
    return response(401, { ok: false, error: "unauthorized" });
  }
  if (authentication.method === "session" && !hasSameOrigin(request)) {
    return response(403, { ok: false, error: "invalid_request" });
  }

  await disableTotp();
  return response(200, { ok: true });
}
