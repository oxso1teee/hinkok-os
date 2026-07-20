import "server-only";

import type { NextRequest } from "next/server";

import {
  LOGIN_GLOBAL_WINDOW_SECONDS,
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

/**
 * Account-wide failure count regardless of ip, for the [P0-AUTH-04] global
 * lockout/backoff/alert — closes the ip-rotation bypass of the per-ip gate
 * in registerLoginAttempt() above.
 *
 * Fails open (returns 0) rather than throwing: this is a defense-in-depth
 * layer on top of the per-ip gate above, which already fully enforces the
 * core lockout on its own. An outage of this specific query must never turn
 * an ordinary wrong-password 401 into a 503 for the whole login flow.
 */
export async function countRecentGlobalLoginFailures(): Promise<number> {
  try {
    const { data, error } = await db().rpc("count_recent_login_failures", {
      p_window_seconds: LOGIN_GLOBAL_WINDOW_SECONDS,
    });

    if (error) throw error;
    return typeof data === "number" ? data : 0;
  } catch (error: unknown) {
    console.warn("Unable to count recent login failures; continuing without the global lockout", error);
    return 0;
  }
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

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
