import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/request";
import { getOperationsDashboardData } from "@/lib/operations/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authentication = authenticateRequest(request);
  if (!authentication.authenticated) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const data = await getOperationsDashboardData();
  return NextResponse.json(
    { ok: true, data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
