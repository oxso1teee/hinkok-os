import type { NextRequest, NextResponse } from "next/server";

import { POST as askMemory } from "@/app/api/ask/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest): Promise<NextResponse> {
  return askMemory(request);
}
