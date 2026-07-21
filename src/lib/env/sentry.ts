import "server-only";

import { z } from "zod";

const optionalString = (schema: z.ZodString) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    schema.optional(),
  );

const sentryEnvironmentSchema = z.object({
  SENTRY_DSN: optionalString(z.string().trim().url()),
});

const parsedEnvironment = sentryEnvironmentSchema.safeParse({
  SENTRY_DSN: process.env.SENTRY_DSN,
});

if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid Sentry environment variables: ${parsedEnvironment.error.issues
      .map((issue) => issue.message)
      .join("; ")}`,
  );
}

export const sentryEnv = Object.freeze(parsedEnvironment.data);

export function isSentryConfigured(): boolean {
  return typeof sentryEnv.SENTRY_DSN === "string";
}
