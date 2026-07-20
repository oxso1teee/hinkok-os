import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/request";
import { isGoogleOAuthConfigured } from "@/lib/env/google";
import { googleAuthorizationUrl } from "@/lib/integrations/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isGoogleOAuthConfigured()) return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  try {
    return NextResponse.redirect(await googleAuthorizationUrl(), { status: 302 });
  } catch (cause) {
    console.error("Google OAuth initialization failed", cause);
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
