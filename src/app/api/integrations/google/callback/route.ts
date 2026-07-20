import { NextRequest, NextResponse } from "next/server";
import { consumeGoogleOAuthState, exchangeGoogleAuthorizationCode } from "@/lib/integrations/google-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const error = request.nextUrl.searchParams.get("error");
  const redirect = new URL("/settings", request.nextUrl.origin);
  if (error || !code || !state) {
    redirect.searchParams.set("google", error === "access_denied" ? "cancelled" : "failed");
    return NextResponse.redirect(redirect, { status: 302 });
  }
  try {
    const codeVerifier = await consumeGoogleOAuthState(state);
    if (!codeVerifier) {
      redirect.searchParams.set("google", "failed");
      return NextResponse.redirect(redirect, { status: 302 });
    }
    await exchangeGoogleAuthorizationCode(code, codeVerifier);
    redirect.searchParams.set("google", "connected");
  } catch (cause) {
    console.error("Google OAuth callback failed", cause);
    redirect.searchParams.set("google", "failed");
  }
  return NextResponse.redirect(redirect, { status: 302 });
}
