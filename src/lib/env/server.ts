import "server-only";

import { z } from "zod";

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

const serverEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .trim()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .trim()
    .min(20, "SUPABASE_SERVICE_ROLE_KEY is missing or too short"),
  USER_ID: z
    .string()
    .trim()
    .min(1, "USER_ID is required")
    .max(128, "USER_ID must not exceed 128 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "USER_ID may contain only letters, numbers, underscores and hyphens",
    ),
  USER_TIMEZONE: z
    .string()
    .trim()
    .min(1, "USER_TIMEZONE is required")
    .refine(isValidTimeZone, "USER_TIMEZONE must be a valid IANA timezone"),
  AUTH_SECRET: z
    .string()
    .min(64, "AUTH_SECRET must contain at least 64 characters"),
  DASHBOARD_PASSWORD: z
    .string()
    .min(12, "DASHBOARD_PASSWORD must contain at least 12 characters")
    .max(256, "DASHBOARD_PASSWORD must not exceed 256 characters"),
  API_SECRET: z
    .string()
    .min(32, "API_SECRET must contain at least 32 characters"),
});

const parsedEnvironment = serverEnvironmentSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  USER_ID: process.env.USER_ID,
  USER_TIMEZONE: process.env.USER_TIMEZONE,
  AUTH_SECRET: process.env.AUTH_SECRET,
  DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD,
  API_SECRET: process.env.API_SECRET,
});

if (!parsedEnvironment.success) {
  const invalidFields = parsedEnvironment.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid server environment variables: ${invalidFields}`);
}

export const serverEnv = Object.freeze(parsedEnvironment.data);
