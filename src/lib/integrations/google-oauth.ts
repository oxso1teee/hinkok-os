import "server-only";

import { google, Auth } from "googleapis";
import { googleEnv, isGoogleOAuthConfigured } from "@/lib/env/google";
import { serverEnv } from "@/lib/env/server";
import { db } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import { decryptGoogleToken, encryptGoogleToken } from "@/lib/integrations/google-token-crypto";
import {
  createGooglePkceTransaction,
  hashGoogleOAuthState,
} from "@/lib/integrations/google-pkce";

const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/spreadsheets.readonly"];

type Connection = { encrypted_access_token: string | null; encrypted_refresh_token: string | null; token_expiry: string | null; scopes: string[]; connected_email: string | null; calendar_sync_token: string | null };

function oauthClient() {
  if (!isGoogleOAuthConfigured()) throw new Error("Google OAuth is not configured");
  return new google.auth.OAuth2(googleEnv.GOOGLE_OAUTH_CLIENT_ID, googleEnv.GOOGLE_OAUTH_CLIENT_SECRET, googleEnv.GOOGLE_OAUTH_REDIRECT_URI);
}

export async function googleAuthorizationUrl(): Promise<string> {
  const transaction = createGooglePkceTransaction();
  const { error } = await db().from("google_oauth_states").insert({
    user_id: serverEnv.USER_ID,
    state_hash: transaction.stateHash,
    encrypted_code_verifier: encryptGoogleToken(transaction.verifier),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw new Error("Unable to start Google OAuth connection", { cause: error });

  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: SCOPES,
    state: transaction.state,
    code_challenge: transaction.challenge,
    code_challenge_method: Auth.CodeChallengeMethod.S256,
  });
}

export async function consumeGoogleOAuthState(state: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(state)) return null;
  const { data, error } = await db().rpc("consume_google_oauth_state", {
    p_user_id: serverEnv.USER_ID,
    p_state_hash: hashGoogleOAuthState(state),
  });
  if (error || !data) return null;
  return decryptGoogleToken(data);
}

export async function exchangeGoogleAuthorizationCode(code: string, codeVerifier: string): Promise<void> {
  const client = oauthClient();
  const { tokens } = await client.getToken({ code, codeVerifier });
  if (!tokens.access_token) throw new Error("Google did not return an access token");
  client.setCredentials(tokens);
  const userInfo = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
  const { data: existing } = await db().from("google_oauth_connections").select("encrypted_refresh_token").eq("user_id", serverEnv.USER_ID).eq("provider", "google").maybeSingle();
  const refresh = tokens.refresh_token ? encryptGoogleToken(tokens.refresh_token) : existing?.encrypted_refresh_token ?? null;
  if (!refresh) throw new Error("Google did not return a refresh token; revoke access and reconnect with consent");
  const { error } = await db().from("google_oauth_connections").upsert({
    user_id: serverEnv.USER_ID, provider: "google", encrypted_access_token: encryptGoogleToken(tokens.access_token), encrypted_refresh_token: refresh,
    token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null, scopes: tokens.scope?.split(" ").filter(Boolean) ?? SCOPES,
    connected_email: userInfo.data.email ?? null, calendar_sync_token: null,
  }, { onConflict: "user_id,provider" });
  if (error) throw new Error("Unable to save Google OAuth connection", { cause: error });
}

export function isInvalidGrantError(error: unknown): boolean {
  const candidate = error as { response?: { data?: { error?: unknown } }; message?: unknown } | null;
  if (candidate?.response?.data?.error === "invalid_grant") return true;
  return typeof candidate?.message === "string" && candidate.message.includes("invalid_grant");
}

async function clearRevokedGoogleConnection(): Promise<void> {
  await db().from("google_oauth_connections").delete().eq("user_id", serverEnv.USER_ID).eq("provider", "google");
}

export async function getGoogleOAuthClient() {
  const { data, error } = await db().from("google_oauth_connections").select("encrypted_access_token,encrypted_refresh_token,token_expiry,scopes,connected_email,calendar_sync_token").eq("user_id", serverEnv.USER_ID).eq("provider", "google").maybeSingle();
  if (error || !data) throw new Error("Google OAuth connection is unavailable", { cause: error });
  const connection = data as Connection;
  const client = oauthClient();
  client.setCredentials({ access_token: connection.encrypted_access_token ? decryptGoogleToken(connection.encrypted_access_token) : undefined, refresh_token: connection.encrypted_refresh_token ? decryptGoogleToken(connection.encrypted_refresh_token) : undefined, expiry_date: connection.token_expiry ? Date.parse(connection.token_expiry) : undefined });
  client.on("tokens", async (tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
  }) => {
    const update: Database["public"]["Tables"]["google_oauth_connections"]["Update"] = {};
    if (tokens.access_token) update.encrypted_access_token = encryptGoogleToken(tokens.access_token);
    if (tokens.refresh_token) update.encrypted_refresh_token = encryptGoogleToken(tokens.refresh_token);
    if (tokens.expiry_date) update.token_expiry = new Date(tokens.expiry_date).toISOString();
    if (Object.keys(update).length) await db().from("google_oauth_connections").update(update).eq("user_id", serverEnv.USER_ID).eq("provider", "google");
  });
  try {
    await client.getAccessToken();
  } catch (tokenError: unknown) {
    if (isInvalidGrantError(tokenError)) {
      await clearRevokedGoogleConnection();
      throw new Error("Google OAuth connection was revoked; reconnect required", { cause: tokenError });
    }
    throw tokenError;
  }
  return { client, connection };
}

export async function disconnectGoogleOAuth(): Promise<void> {
  const { data } = await db().from("google_oauth_connections").select("encrypted_access_token").eq("user_id", serverEnv.USER_ID).eq("provider", "google").maybeSingle();
  if (data?.encrypted_access_token) { try { await oauthClient().revokeToken(decryptGoogleToken(data.encrypted_access_token)); } catch {} }
  const { error } = await db().from("google_oauth_connections").delete().eq("user_id", serverEnv.USER_ID).eq("provider", "google");
  if (error) throw new Error("Unable to disconnect Google OAuth", { cause: error });
}
