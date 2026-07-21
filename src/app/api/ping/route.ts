import { NextResponse } from "next/server";

import { db } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * [P0-OBS2-02] Public, unauthenticated, minimal uptime check for an external
 * monitor (UptimeRobot, Better Uptime, a cron-based ping service, etc.) to
 * poll. Deliberately separate from /api/internal/db-health, which is
 * dev-only and returns richer diagnostic detail (entity counts) not safe to
 * expose on a publicly reachable endpoint.
 */
export async function GET() {
  try {
    const { error } = await db()
      .from("personal_settings")
      .select("user_id", { count: "exact", head: true });

    if (error) throw error;

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    console.error("Public uptime ping failed", error);

    return NextResponse.json(
      { ok: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
