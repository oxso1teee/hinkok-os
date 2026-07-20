import "server-only";

import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(32).max(512).optional(),
);

const cronEnvironmentSchema = z.object({
  CRON_SECRET: optionalSecret,
});

const parsedEnvironment = cronEnvironmentSchema.safeParse({
  CRON_SECRET: process.env.CRON_SECRET,
});

if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid cron environment variables: ${parsedEnvironment.error.issues
      .map((issue) => issue.message)
      .join("; ")}`,
  );
}

export const cronEnv = Object.freeze(parsedEnvironment.data);
