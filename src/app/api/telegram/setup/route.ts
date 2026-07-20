import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/lib/auth/dal";
import {
  isTelegramConfigured,
  telegramEnv,
  telegramWebhookToken,
} from "@/lib/env/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const telegramEnvelopeSchema = z.object({
  ok: z.boolean(),
  description: z.string().optional(),
});

const BOT_COMMANDS = [
  { command: "start", description: "Открыть меню HinkoK OS" },
  { command: "task", description: "Создать задачу в CRM" },
  { command: "journal", description: "Добавить запись в дневник" },
  { command: "meal", description: "Записать приём пищи" },
  { command: "event", description: "Создать событие" },
  { command: "note", description: "Сохранить заметку" },
  { command: "menu", description: "Показать меню и разделы" },
  { command: "help", description: "Показать инструкцию" },
];

async function telegramMutation(
  botToken: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const parsed = telegramEnvelopeSchema.safeParse(
    await response.json().catch(() => null),
  );

  if (!response.ok || !parsed.success || !parsed.data.ok) {
    throw new Error(`Telegram rejected ${method}`);
  }
}

function productionOrigin(): string {
  const hostname = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();

  if (hostname && /^[a-z0-9-]+\.vercel\.app$/i.test(hostname)) {
    return `https://${hostname}`;
  }

  return "https://hinkok-os-phi.vercel.app";
}

export async function POST(): Promise<NextResponse> {
  await requireSession();

  const webhookToken = telegramWebhookToken();
  const botToken = telegramEnv.TELEGRAM_BOT_TOKEN;

  if (!isTelegramConfigured() || !webhookToken || !botToken) {
    return NextResponse.json(
      { ok: false, error: "telegram_not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const webhookUrl = new URL("/api/webhook/telegram", productionOrigin());
  webhookUrl.searchParams.set("token", webhookToken);

  try {
    await telegramMutation(botToken, "setMyCommands", {
      commands: BOT_COMMANDS,
      language_code: "ru",
    });
    await telegramMutation(botToken, "setMyDescription", {
      description: "Личный вход в HinkoK OS: задачи, дневник, питание, события, голос и фотографии.",
      language_code: "ru",
    });
    await telegramMutation(botToken, "setMyShortDescription", {
      short_description: "Быстрый захват мыслей в HinkoK OS",
      language_code: "ru",
    });
    await telegramMutation(botToken, "setWebhook", {
      url: webhookUrl.toString(),
      secret_token: webhookToken,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
  } catch (error: unknown) {
    console.error("Telegram setup request failed", error);
    return NextResponse.json(
      { ok: false, error: "telegram_unreachable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { ok: true, bot: "@HinkoKOSBot_bot" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
