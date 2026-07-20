import "server-only";

import { isTelegramConfigured, telegramEnv } from "@/lib/env/telegram";
import type { SystemJobName } from "@/lib/operations/normalize";
import { sendTelegramMessage } from "@/lib/telegram/client";

/**
 * [P0-OPS-01] add-alerting-not-just-dashboard: without this, a failed or
 * abandoned cron job is only visible by opening the private /operations
 * dashboard — so a broken calendar sync goes unnoticed until someone happens
 * to check.
 */
export async function alertOwnerOfJobOutcome(
  jobName: SystemJobName,
  status: "failed" | "abandoned",
  detail: string,
): Promise<void> {
  if (!isTelegramConfigured() || !telegramEnv.TELEGRAM_USER_ID) return;

  const verb = status === "failed" ? "упала" : "зависла и была помечена заброшенной";

  try {
    await sendTelegramMessage(
      Number(telegramEnv.TELEGRAM_USER_ID),
      `⚠️ Задача "${jobName}" ${verb}. ${detail}`,
    );
  } catch (error: unknown) {
    console.error("Unable to send job-failure Telegram alert", error);
  }
}
