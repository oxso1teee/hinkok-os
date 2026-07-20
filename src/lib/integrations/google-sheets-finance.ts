import "server-only";

import { google } from "googleapis";
import { getGoogleAuth } from "@/lib/integrations/google-auth";

import { recordAuditEvent } from "@/lib/audit";
import {
  googleEnv,
  isGoogleSheetsFinanceConfigured,
} from "@/lib/env/google";
import { serverEnv } from "@/lib/env/server";
import { parseFinanceSheet } from "@/lib/finance/sheet-parser";
import { db } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

const GOOGLE_REQUEST_TIMEOUT_MS = 45_000;

async function sheets() {
  const auth = await getGoogleAuth(["https://www.googleapis.com/auth/spreadsheets.readonly"]);
  return google.sheets({ version: "v4", auth: auth as never });
}

export type GoogleSheetsFinanceSyncResult = {
  transactionCount: number;
  upsertedCount: number;
  deletedCount: number;
  skippedBlankRows: number;
};

export async function syncGoogleSheetsFinance(): Promise<GoogleSheetsFinanceSyncResult> {
  if (
    !isGoogleSheetsFinanceConfigured() ||
    !googleEnv.GOOGLE_SHEETS_FINANCE_ID
  ) {
    throw new Error("Google Sheets finance integration is not configured");
  }

  const spreadsheetId = googleEnv.GOOGLE_SHEETS_FINANCE_ID;
  const sheetResponse = await (await sheets()).spreadsheets.values.get(
    {
      spreadsheetId,
      range: googleEnv.GOOGLE_SHEETS_FINANCE_RANGE,
      majorDimension: "ROWS",
      valueRenderOption: "FORMATTED_VALUE",
    },
    {
      timeout: GOOGLE_REQUEST_TIMEOUT_MS,
      retry: true,
      retryConfig: { retry: 2 },
    },
  );
  const rows = sheetResponse.data.values ?? [];
  const parsed = parseFinanceSheet(
    rows,
    spreadsheetId,
    googleEnv.GOOGLE_SHEETS_FINANCE_DEFAULT_CURRENCY,
  );
  const transactions = parsed.transactions.map((transaction) => ({
    external_key: transaction.externalKey,
    transaction_date: transaction.transactionDate,
    amount: transaction.amount,
    currency: transaction.currency,
    category: transaction.category,
    description: transaction.description,
    account: transaction.account,
    metadata: transaction.metadata,
  }));
  const { data, error } = await db().rpc("sync_finance_transactions", {
    p_user_id: serverEnv.USER_ID,
    p_transactions: transactions as unknown as Json,
  });
  const syncResult = data?.[0];

  if (!syncResult || error) {
    throw new Error("Unable to store Google Sheets finance data", {
      cause: error,
    });
  }

  await recordAuditEvent({
    action: "finance.google_sheets_synchronized",
    resourceType: "finance_transactions",
    metadata: {
      transactionCount: transactions.length,
      upsertedCount: syncResult.upserted_count,
      deletedCount: syncResult.deleted_count,
      skippedBlankRows: parsed.skippedBlankRows,
      range: googleEnv.GOOGLE_SHEETS_FINANCE_RANGE,
    },
  });

  return {
    transactionCount: transactions.length,
    upsertedCount: syncResult.upserted_count,
    deletedCount: syncResult.deleted_count,
    skippedBlankRows: parsed.skippedBlankRows,
  };
}
