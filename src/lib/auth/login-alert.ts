import "server-only";

import { isTelegramConfigured, telegramEnv } from "@/lib/env/telegram";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { LOGIN_ALERT_EVERY_N_FAILURES } from "@/lib/auth/constants";

/**
 * Fires at most once per crossed multiple of LOGIN_ALERT_EVERY_N_FAILURES
 * (5, 10, 15, ...): registerLoginAttempt() stops inserting rows once a gate
 * is tripped, so globalFailures stays flat while blocked and this does not
 * re-fire on every subsequent request during a lockout.
 */
export async function maybeAlertOwnerOfLoginFailures(
  globalFailures: number,
  ip: string,
): Promise<void> {
  if (globalFailures <= 0) return;
  if (globalFailures % LOGIN_ALERT_EVERY_N_FAILURES !== 0) return;
  if (!isTelegramConfigured() || !telegramEnv.TELEGRAM_USER_ID) return;

  try {
    await sendTelegramMessage(
      Number(telegramEnv.TELEGRAM_USER_ID),
      `⚠️ ${globalFailures} неудачных попыток входа в HinkoK OS за последние 15 минут (последняя — с IP ${ip}). Кто-то ломится в твой дашборд.`,
    );
  } catch {
    // Best-effort: a failed alert must never block or fail the login response.
  }
}
