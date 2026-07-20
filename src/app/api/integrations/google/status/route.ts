import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/request";
import { serverEnv } from "@/lib/env/server";
import { db } from "@/lib/supabase/admin";
import {
  isGoogleCalendarConfigured,
  isGoogleOAuthConfigured,
  isGoogleSheetsFinanceConfigured,
} from "@/lib/env/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authenticateRequest(request).authenticated) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const oauthConfigured = isGoogleOAuthConfigured();
  if (!oauthConfigured) {
    return NextResponse.json({
      ok: true,
      configured: false,
      connected: false,
      calendarConfigured: isGoogleCalendarConfigured(),
      financeConfigured: isGoogleSheetsFinanceConfigured(),
      connection: null,
    }, { headers: { "Cache-Control": "no-store" } });
  }
  const { data, error } = await db().from("google_oauth_connections").select("connected_email,scopes,token_expiry,updated_at").eq("user_id", serverEnv.USER_ID).eq("provider", "google").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  return NextResponse.json({
    ok: true,
    configured: true,
    connected: Boolean(data?.connected_email),
    calendarConfigured: isGoogleCalendarConfigured(),
    financeConfigured: isGoogleSheetsFinanceConfigured(),
    connection: data,
  }, { headers: { "Cache-Control": "no-store" } });
}
