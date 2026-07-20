import "server-only";

import { google } from "googleapis";
import { googleEnv, isGoogleOAuthConfigured } from "@/lib/env/google";
import { getGoogleOAuthClient } from "@/lib/integrations/google-oauth";

export async function getGoogleAuth(scopes: string[]): Promise<unknown> {
  if (isGoogleOAuthConfigured()) {
    try {
      return (await getGoogleOAuthClient()).client;
    } catch {
      // OAuth is configured but not connected yet; a service account may still be available.
    }
  }
  if (!googleEnv.GOOGLE_SERVICE_ACCOUNT_EMAIL || !googleEnv.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error("Google authentication is not connected");
  }
  return new google.auth.JWT({ email: googleEnv.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: googleEnv.GOOGLE_SERVICE_ACCOUNT_KEY, scopes });
}
