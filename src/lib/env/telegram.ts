import "server-only";

import { z } from "zod";

const optionalString = (schema: z.ZodString) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    schema.optional(),
  );

const telegramEnvironmentSchema = z
  .object({
    TELEGRAM_BOT_TOKEN: optionalString(
      z.string().trim().regex(/^\d+:[A-Za-z0-9_-]{30,}$/),
    ),
    TELEGRAM_WEBHOOK_SECRET: optionalString(
      z.string().trim().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/),
    ),
    TELEGRAM_WEBHOOK_TOKEN: optionalString(
      z.string().trim().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/),
    ),
    TELEGRAM_USER_ID: optionalString(z.string().trim().regex(/^\d+$/)),
  })
  .superRefine((value, context) => {
    const webhookToken =
      value.TELEGRAM_WEBHOOK_TOKEN ?? value.TELEGRAM_WEBHOOK_SECRET;
    const configured = Boolean(
      value.TELEGRAM_BOT_TOKEN || webhookToken || value.TELEGRAM_USER_ID,
    );

    if (
      configured &&
      (!value.TELEGRAM_BOT_TOKEN || !webhookToken || !value.TELEGRAM_USER_ID)
    ) {
      context.addIssue({
        code: "custom",
        message: "Telegram variables must be configured together",
      });
    }
  });

const parsedEnvironment = telegramEnvironmentSchema.safeParse({
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  TELEGRAM_WEBHOOK_TOKEN: process.env.TELEGRAM_WEBHOOK_TOKEN,
  TELEGRAM_USER_ID: process.env.TELEGRAM_USER_ID,
});

if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid Telegram environment variables: ${parsedEnvironment.error.issues
      .map((issue) => issue.message)
      .join("; ")}`,
  );
}

export const telegramEnv = Object.freeze(parsedEnvironment.data);

export function telegramWebhookToken(): string | undefined {
  return (
    telegramEnv.TELEGRAM_WEBHOOK_TOKEN ??
    telegramEnv.TELEGRAM_WEBHOOK_SECRET
  );
}

export function isTelegramConfigured(): boolean {
  return Boolean(
      telegramEnv.TELEGRAM_BOT_TOKEN &&
      telegramWebhookToken() &&
      telegramEnv.TELEGRAM_USER_ID,
  );
}
