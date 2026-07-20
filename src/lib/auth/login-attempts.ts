import "server-only";

import type { NextRequest } from "next/server";

import {
  LOGIN_MAX_FAILURES,
  LOGIN_MIN_RESPONSE_MS,
  LOGIN_WINDOW_MINUTES,
} from "@/lib/auth/constants";
import { db } from "@/lib/supabase/admin";

export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const candidate = forwardedFor?.split(",")[0]?.trim() || realIp?.trim();

  if (!candidate) {
    return "unknown";
  }

  return candidate.slice(0, 128);
}

export async function registerLoginAttempt(
  ip: string,
  ok: boolean,
): Promise<boolean> {
  const { data, error } = await db().rpc("register_login_attempt", {
    p_ip: ip,
    p_ok: ok,
    p_window_seconds: LOGIN_WINDOW_MINUTES * 60,
    p_max_failures: LOGIN_MAX_FAILURES,
  });

  if (error) {
    throw new Error("Unable to register login attempt", { cause: error });
  }

  return data === true;
}

export async function enforceMinimumLoginTime(
  startedAtMs: number,
): Promise<void> {
  const remainingMs = LOGIN_MIN_RESPONSE_MS - (Date.now() - startedAtMs);

  if (remainingMs <= 0) {
    return;
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, remainingMs);
  });
}
