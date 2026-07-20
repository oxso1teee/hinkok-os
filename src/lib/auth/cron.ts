import "server-only";

import type { NextRequest } from "next/server";

import { constantTimeStringEqual } from "@/lib/auth/constant-time";
import { cronEnv } from "@/lib/env/cron";

export function hasValidCronAuthorization(request: NextRequest): boolean {
  if (!cronEnv.CRON_SECRET) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix)) return false;
  const suppliedSecret = authorization.slice(prefix.length);
  return suppliedSecret.length > 0
    && suppliedSecret.length <= 512
    && constantTimeStringEqual(suppliedSecret, cronEnv.CRON_SECRET);
}
