import "server-only";

import { serverEnv } from "@/lib/env/server";
import { db } from "@/lib/supabase/admin";

export type ActiveSession = {
  sessionId: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

export async function recordSession(params: {
  sessionId: string;
  ip: string;
  userAgent: string;
  expiresAt: number;
}): Promise<void> {
  const { error } = await db().from("auth_sessions").insert({
    session_id: params.sessionId,
    user_id: serverEnv.USER_ID,
    ip: params.ip.slice(0, 128),
    user_agent: params.userAgent.slice(0, 512),
    expires_at: new Date(params.expiresAt * 1000).toISOString(),
  });

  if (error) {
    // A session row failing to record must never block the login itself —
    // the signed cookie is still fully valid; only the visibility/revocation
    // feature degrades.
    console.warn("Unable to record session for the active-sessions list", error);
  }
}

/** Fire-and-forget: a slightly stale last_seen_at is fine for a display-only value. */
export function touchSessionLastSeen(sessionId: string): void {
  void db()
    .from("auth_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .then(
      () => undefined,
      (error: unknown) => console.warn("Unable to update session last_seen_at", error),
    );
}

/**
 * Must be awaited: this is the actual revocation enforcement. Fails open
 * (treats as not revoked) on a lookup error so a transient DB issue degrades
 * to "revocation feature temporarily inactive", not "everyone logged out".
 */
export async function isSessionRevoked(sessionId: string): Promise<boolean> {
  try {
    const { data, error } = await db()
      .from("auth_sessions")
      .select("revoked_at")
      .eq("session_id", sessionId)
      .maybeSingle<{ revoked_at: string | null }>();

    if (error) throw error;
    return data?.revoked_at != null;
  } catch (error: unknown) {
    console.warn("Unable to check session revocation status", error);
    return false;
  }
}

export async function listActiveSessions(): Promise<ActiveSession[]> {
  const { data, error } = await db()
    .from("auth_sessions")
    .select("session_id, ip, user_agent, created_at, last_seen_at, expires_at")
    .eq("user_id", serverEnv.USER_ID)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("last_seen_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error("Unable to list active sessions", { cause: error });
  }

  return (data ?? []).map((row) => ({
    sessionId: row.session_id,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
  }));
}

export async function revokeOtherSessions(
  currentSessionId: string,
): Promise<number> {
  const { data, error } = await db().rpc("revoke_other_sessions", {
    p_user_id: serverEnv.USER_ID,
    p_keep_session_id: currentSessionId,
  });

  if (error) {
    throw new Error("Unable to revoke other sessions", { cause: error });
  }

  return typeof data === "number" ? data : 0;
}

export async function revokeSession(sessionId: string): Promise<void> {
  const { error } = await db()
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("session_id", sessionId);

  if (error) {
    console.warn("Unable to revoke session on logout", error);
  }
}
