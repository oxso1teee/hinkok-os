import type { NextRequest } from "next/server";

import { processTelegramWebhook } from "@/lib/telegram/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  return processTelegramWebhook(request);
}
