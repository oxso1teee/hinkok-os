import "server-only";

import type { PasswordHash } from "@/lib/auth/password-hash";
import { serverEnv } from "@/lib/env/server";
import { db } from "@/lib/supabase/admin";

type PasswordOverrideRow = {
  password_hash: string;
  password_salt: string;
  password_scrypt_cost: number;
};

export async function getPasswordOverride(): Promise<PasswordHash | null> {
  const { data, error } = await db()
    .from("auth_password_override")
    .select("password_hash, password_salt, password_scrypt_cost")
    .eq("user_id", serverEnv.USER_ID)
    .maybeSingle<PasswordOverrideRow>();

  if (error || !data) return null;

  return {
    hash: data.password_hash,
    salt: data.password_salt,
    cost: data.password_scrypt_cost,
  };
}

export async function setPasswordOverride(hash: PasswordHash): Promise<void> {
  const { error } = await db().from("auth_password_override").upsert(
    {
      user_id: serverEnv.USER_ID,
      password_hash: hash.hash,
      password_salt: hash.salt,
      password_scrypt_cost: hash.cost,
      recovered_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error("Unable to store the recovered password", { cause: error });
  }
}
