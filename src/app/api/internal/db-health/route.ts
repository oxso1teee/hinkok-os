import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/request";
import { serverEnv } from "@/lib/env/server";
import { db } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!authenticateRequest(request).authenticated) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const checkedAt = new Date().toISOString();

  try {
    const { count, error } = await db()
      .from("entities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", serverEnv.USER_ID);

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        database: "connected",
        userIdConfigured: true,
        entityCount: count ?? 0,
        checkedAt,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    console.error("Database health check failed", error);

    return NextResponse.json(
      { ok: false, database: "unavailable", checkedAt },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
