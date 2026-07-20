import "server-only";

import { generateTotpSecret, verifyTotpCode } from "@/lib/auth/totp";
import { serverEnv } from "@/lib/env/server";
import { db } from "@/lib/supabase/admin";

export type TotpStatus = {
  enabled: boolean;
  pendingSecret: string | null;
};

export async function getTotpStatus(): Promise<TotpStatus> {
  const { data } = await db()
    .from("auth_totp")
    .select("enabled, secret_base32")
    .eq("user_id", serverEnv.USER_ID)
    .maybeSingle<{ enabled: boolean; secret_base32: string }>();

  if (!data) return { enabled: false, pendingSecret: null };

  return {
    enabled: data.enabled,
    pendingSecret: data.enabled ? null : data.secret_base32,
  };
}

export async function startTotpSetup(): Promise<string> {
  const secret = generateTotpSecret();

  const { error } = await db().from("auth_totp").upsert(
    {
      user_id: serverEnv.USER_ID,
      secret_base32: secret,
      enabled: false,
      confirmed_at: null,
      last_used_step: null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error("Unable to start TOTP setup", { cause: error });
  }

  return secret;
}

export async function confirmTotpSetup(code: string): Promise<boolean> {
  const { data } = await db()
    .from("auth_totp")
    .select("secret_base32, enabled")
    .eq("user_id", serverEnv.USER_ID)
    .maybeSingle<{ secret_base32: string; enabled: boolean }>();

  if (!data || data.enabled) return false;

  const result = verifyTotpCode(data.secret_base32, code);
  if (!result.valid) return false;

  const { error } = await db()
    .from("auth_totp")
    .update({
      enabled: true,
      confirmed_at: new Date().toISOString(),
      last_used_step: Number(result.step),
    })
    .eq("user_id", serverEnv.USER_ID);

  if (error) {
    throw new Error("Unable to confirm TOTP setup", { cause: error });
  }

  return true;
}

export async function disableTotp(): Promise<void> {
  const { error } = await db()
    .from("auth_totp")
    .delete()
    .eq("user_id", serverEnv.USER_ID);

  if (error) {
    throw new Error("Unable to disable TOTP", { cause: error });
  }
}

/**
 * Verifies a login-time code against the enabled secret and atomically
 * consumes its step (consume_totp_step) so it cannot be replayed even
 * within the +/-1 step tolerance window.
 */
export async function verifyAndConsumeLoginTotpCode(
  code: string,
): Promise<boolean> {
  const { data } = await db()
    .from("auth_totp")
    .select("secret_base32, enabled")
    .eq("user_id", serverEnv.USER_ID)
    .maybeSingle<{ secret_base32: string; enabled: boolean }>();

  if (!data || !data.enabled) return false;

  const result = verifyTotpCode(data.secret_base32, code);
  if (!result.valid || result.step === null) return false;

  const { data: consumed, error } = await db().rpc("consume_totp_step", {
    p_user_id: serverEnv.USER_ID,
    p_step: Number(result.step),
  });

  if (error) {
    throw new Error("Unable to consume TOTP step", { cause: error });
  }

  return consumed === true;
}

export async function isTotpEnabled(): Promise<boolean> {
  const { data } = await db()
    .from("auth_totp")
    .select("enabled")
    .eq("user_id", serverEnv.USER_ID)
    .maybeSingle<{ enabled: boolean }>();

  return data?.enabled === true;
}
