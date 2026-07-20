import "server-only";

import { z } from "zod";

const optionalSecret = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(32).max(512).optional(),
);

const recoveryEnvironmentSchema = z.object({
  RECOVERY_CODE: optionalSecret,
});

const parsedEnvironment = recoveryEnvironmentSchema.safeParse({
  RECOVERY_CODE: process.env.RECOVERY_CODE,
});

if (!parsedEnvironment.success) {
  throw new Error(
    `Invalid recovery environment variables: ${parsedEnvironment.error.issues
      .map((issue) => issue.message)
      .join("; ")}`,
  );
}

export const recoveryEnv = Object.freeze(parsedEnvironment.data);

export function isRecoveryConfigured(): boolean {
  return typeof recoveryEnv.RECOVERY_CODE === "string";
}
