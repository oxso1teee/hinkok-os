import { NextRequest, NextResponse } from "next/server";

import { constantTimeStringEqual } from "@/lib/auth/constant-time";
import {
  isTelegramConfigured,
  telegramWebhookToken,
} from "@/lib/env/telegram";
import { serverEnv } from "@/lib/env/server";
import { readBoundedJsonBody } from "@/lib/http/json-body";
import {
  claimTelegramUpdate,
  completeTelegramUpdate,
} from "@/lib/integrations/repository";
import { consumeRateLimit } from "@/lib/rate-limit";
import { handleTelegramUpdate } from "@/lib/telegram/handler";
import { telegramUpdateSchema } from "@/lib/telegram/schema";

const MAX_UPDATE_BYTES = 1_048_576;

function response(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function validWebhookCredential(request: NextRequest, expected: string): boolean {
  const headerToken = request.headers.get("x-telegram-bot-api-secret-token");
  const queryToken = request.nextUrl.searchParams.get("token");
  const candidates = [headerToken, queryToken].filter(
    (value): value is string => Boolean(value) && value!.length <= 256,
  );

  return candidates.some((candidate) =>
    constantTimeStringEqual(candidate, expected),
  );
}

export async function processTelegramWebhook(
  request: NextRequest,
): Promise<NextResponse> {
  const expectedToken = telegramWebhookToken();

  if (!isTelegramConfigured() || !expectedToken) {
    return response(503, { ok: false, error: "unavailable" });
  }

  if (!validWebhookCredential(request, expectedToken)) {
    return response(401, { ok: false, error: "unauthorized" });
  }

  try {
    const untrustedBody = await readBoundedJsonBody(request, MAX_UPDATE_BYTES);

    if (!untrustedBody.ok) {
      return response(400, { ok: false, error: "invalid_request" });
    }

    const update = telegramUpdateSchema.safeParse(untrustedBody.value);

    if (!update.success) {
      return response(400, { ok: false, error: "invalid_request" });
    }

    const allowed = await consumeRateLimit({
      bucket: `telegram:${serverEnv.USER_ID}`,
      windowSeconds: 60,
      maxRequests: 30,
    });

    if (!allowed) {
      return response(429, { ok: false, error: "rate_limited" });
    }

    const claimAttempt = await claimTelegramUpdate(update.data.update_id);

    if (!claimAttempt) {
      return response(200, { ok: true, duplicate: true });
    }

    try {
      await handleTelegramUpdate(update.data);
      await completeTelegramUpdate(update.data.update_id, claimAttempt, true);
    } catch (error: unknown) {
      try {
        await completeTelegramUpdate(update.data.update_id, claimAttempt, false);
      } catch (completionError: unknown) {
        console.error("Unable to release failed Telegram update", completionError);
      }

      throw error;
    }

    return response(200, { ok: true });
  } catch (error: unknown) {
    console.error("Telegram webhook processing failed", error);
    return response(503, { ok: false, error: "unavailable" });
  }
}
