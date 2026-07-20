import "server-only";

import { z } from "zod";

const optionalString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const schema = z.object({
  GOOGLE_CALENDAR_ID: optionalString,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: optionalString,
  GOOGLE_SERVICE_ACCOUNT_KEY: optionalString,
  GOOGLE_OAUTH_CLIENT_ID: optionalString,
  GOOGLE_OAUTH_CLIENT_SECRET: optionalString,
  GOOGLE_OAUTH_REDIRECT_URI: optionalString,
  GOOGLE_TOKEN_ENCRYPTION_KEY: optionalString,
  GOOGLE_SHEETS_FINANCE_ID: optionalString,
  GOOGLE_SHEETS_FINANCE_RANGE: optionalString,
  GOOGLE_SHEETS_FINANCE_DEFAULT_CURRENCY: optionalString,
}).superRefine((value, context) => {
  const serviceAccount = [value.GOOGLE_SERVICE_ACCOUNT_EMAIL, value.GOOGLE_SERVICE_ACCOUNT_KEY].filter(Boolean).length;
  if (serviceAccount !== 0 && serviceAccount !== 2) {
    context.addIssue({ code: "custom", message: "Google service-account email and key must be configured together" });
  }
  const oauth = [value.GOOGLE_OAUTH_CLIENT_ID, value.GOOGLE_OAUTH_CLIENT_SECRET, value.GOOGLE_OAUTH_REDIRECT_URI, value.GOOGLE_TOKEN_ENCRYPTION_KEY].filter(Boolean).length;
  if (oauth !== 0 && oauth !== 4) {
    context.addIssue({ code: "custom", message: "Google OAuth client, redirect URI and token encryption key must be configured together" });
  }
  if (value.GOOGLE_TOKEN_ENCRYPTION_KEY && !/^[A-Za-z0-9+/=_-]{43,128}$/.test(value.GOOGLE_TOKEN_ENCRYPTION_KEY)) {
    context.addIssue({ code: "custom", message: "GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64/base64url encoded 32-byte key" });
  }
  if (value.GOOGLE_OAUTH_REDIRECT_URI) {
    try { new URL(value.GOOGLE_OAUTH_REDIRECT_URI); } catch {
      context.addIssue({ code: "custom", message: "GOOGLE_OAUTH_REDIRECT_URI must be a valid URL" });
    }
  }
  if (value.GOOGLE_SHEETS_FINANCE_DEFAULT_CURRENCY && !/^[A-Za-z]{3}$/.test(value.GOOGLE_SHEETS_FINANCE_DEFAULT_CURRENCY)) {
    context.addIssue({ code: "custom", message: "Google Sheets default currency must be a three-letter code" });
  }
});

const parsed = schema.safeParse({
  GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  GOOGLE_SERVICE_ACCOUNT_KEY: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
  GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI,
  GOOGLE_TOKEN_ENCRYPTION_KEY: process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  GOOGLE_SHEETS_FINANCE_ID: process.env.GOOGLE_SHEETS_FINANCE_ID,
  GOOGLE_SHEETS_FINANCE_RANGE: process.env.GOOGLE_SHEETS_FINANCE_RANGE,
  GOOGLE_SHEETS_FINANCE_DEFAULT_CURRENCY: process.env.GOOGLE_SHEETS_FINANCE_DEFAULT_CURRENCY,
});
if (!parsed.success) throw new Error(`Invalid Google environment variables: ${parsed.error.issues.map((i) => i.message).join("; ")}`);

export const googleEnv = Object.freeze({
  ...parsed.data,
  GOOGLE_SERVICE_ACCOUNT_KEY: parsed.data.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n"),
  GOOGLE_SHEETS_FINANCE_RANGE: parsed.data.GOOGLE_SHEETS_FINANCE_RANGE ?? "Transactions!A:G",
  GOOGLE_SHEETS_FINANCE_DEFAULT_CURRENCY: parsed.data.GOOGLE_SHEETS_FINANCE_DEFAULT_CURRENCY?.toUpperCase() ?? "EUR",
});
export const isGoogleOAuthConfigured = () => Boolean(googleEnv.GOOGLE_OAUTH_CLIENT_ID && googleEnv.GOOGLE_OAUTH_CLIENT_SECRET && googleEnv.GOOGLE_OAUTH_REDIRECT_URI && googleEnv.GOOGLE_TOKEN_ENCRYPTION_KEY);
export const isGoogleCalendarConfigured = () => Boolean(googleEnv.GOOGLE_CALENDAR_ID && ((googleEnv.GOOGLE_SERVICE_ACCOUNT_EMAIL && googleEnv.GOOGLE_SERVICE_ACCOUNT_KEY) || isGoogleOAuthConfigured()));
export const isGoogleSheetsFinanceConfigured = () => Boolean(googleEnv.GOOGLE_SHEETS_FINANCE_ID && ((googleEnv.GOOGLE_SERVICE_ACCOUNT_EMAIL && googleEnv.GOOGLE_SERVICE_ACCOUNT_KEY) || isGoogleOAuthConfigured()));
