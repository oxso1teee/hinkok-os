import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/request";
import { hasSameOrigin } from "@/lib/auth/origin";
import { disconnectGoogleOAuth } from "@/lib/integrations/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = authenticateRequest(request);
  if (!auth.authenticated) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (auth.method === "session" && !hasSameOrigin(request)) return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  try { await disconnectGoogleOAuth(); return NextResponse.json({ ok: true }); }
  catch (cause) { console.error("Google disconnect failed", cause); return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 }); }
}
