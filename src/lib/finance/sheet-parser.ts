import { createHash } from "node:crypto";

export type FinanceTransactionInput = {
  externalKey: string;
  transactionDate: string;
  amount: number;
  currency: string;
  category: string | null;
  description: string | null;
  account: string | null;
  metadata: { sheetRow: number };
};

export type ParsedFinanceSheet = {
  transactions: FinanceTransactionInput[];
  skippedBlankRows: number;
};

type ColumnName =
  | "date"
  | "amount"
  | "currency"
  | "category"
  | "description"
  | "account"
  | "externalId";

const HEADER_ALIASES: Readonly<Record<string, ColumnName>> = Object.freeze({
  date: "date",
  дата: "date",
  amount: "amount",
  сумма: "amount",
  currency: "currency",
  валюта: "currency",
  category: "category",
  категория: "category",
  description: "description",
  описание: "description",
  comment: "description",
  комментарий: "description",
  account: "account",
  счет: "account",
  externalid: "externalId",
  transactionid: "externalId",
  id: "externalId",
  идентификатор: "externalId",
});

function normalizedHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function cellText(value: unknown, maximumLength: number): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).replace(/\s+/g, " ").trim();

  if (!text) {
    return null;
  }

  if (text.length > maximumLength || /[\u0000-\u001f\u007f]/u.test(text)) {
    throw new Error("Finance sheet contains an invalid text cell");
  }

  return text;
}

function calendarDate(value: unknown): string {
  const text = cellText(value, 32);

  if (!text) {
    throw new Error("Finance transaction date is missing");
  }

  let year: number;
  let month: number;
  let day: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(text);

  if (match) {
    [, year, month, day] = match.map(Number);
  } else {
    match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/u.exec(text);

    if (!match) {
      throw new Error(`Invalid finance transaction date: ${text}`);
    }

    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    year < 2000 ||
    year > 2100 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid finance transaction date: ${text}`);
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monetaryAmount(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Finance transaction amount is invalid");
    }

    const rounded = Math.round(value * 100) / 100;
    if (rounded === 0 || Math.abs(rounded) > 1_000_000_000) {
      throw new Error("Finance transaction amount is outside the accepted range");
    }
    return rounded;
  }

  const text = cellText(value, 64);
  if (!text) {
    throw new Error("Finance transaction amount is missing");
  }

  let normalized = text
    .replace(/[\s\u00a0']/g, "")
    .replace(/[^0-9,\.\-+]/g, "");
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const groupingSeparator = decimalSeparator === "," ? /\./g : /,/g;
    normalized = normalized.replace(groupingSeparator, "");
    if (decimalSeparator === ",") {
      normalized = normalized.replace(",", ".");
    }
  } else if (lastComma >= 0) {
    normalized = normalized.replace(",", ".");
  }

  if (!/^[+-]?\d+(?:\.\d{1,2})?$/u.test(normalized)) {
    throw new Error(`Invalid finance transaction amount: ${text}`);
  }

  return monetaryAmount(Number(normalized));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function parseFinanceSheet(
  rows: unknown[][],
  spreadsheetId: string,
  defaultCurrency = "EUR",
): ParsedFinanceSheet {
  if (rows.length === 0) {
    throw new Error("Finance sheet has no header row");
  }

  if (rows.length > 5_001) {
    throw new Error("Finance sheet exceeds the 5000-transaction limit");
  }

  const currencyFallback = defaultCurrency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(currencyFallback)) {
    throw new Error("Invalid default finance currency");
  }

  const columns = new Map<ColumnName, number>();
  rows[0].forEach((header, index) => {
    const column = HEADER_ALIASES[normalizedHeader(header)];
    if (!column) {
      return;
    }
    if (columns.has(column)) {
      throw new Error(`Duplicate finance sheet column: ${column}`);
    }
    columns.set(column, index);
  });

  if (!columns.has("date") || !columns.has("amount")) {
    throw new Error("Finance sheet requires date and amount columns");
  }

  const transactions: FinanceTransactionInput[] = [];
  const usedExternalKeys = new Set<string>();
  const fingerprintOccurrences = new Map<string, number>();
  let skippedBlankRows = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.every((cell) => cellText(cell, 1_000) === null)) {
      skippedBlankRows += 1;
      continue;
    }

    const get = (column: ColumnName): unknown => {
      const columnIndex = columns.get(column);
      return columnIndex === undefined ? undefined : row[columnIndex];
    };
    const transactionDate = calendarDate(get("date"));
    const amount = monetaryAmount(get("amount"));
    const rawCurrency = cellText(get("currency"), 3)?.toUpperCase();
    const currency = rawCurrency ?? currencyFallback;

    if (!/^[A-Z]{3}$/u.test(currency)) {
      throw new Error(`Invalid finance currency on sheet row ${index + 1}`);
    }

    const category = cellText(get("category"), 80);
    const description = cellText(get("description"), 500);
    const account = cellText(get("account"), 120);
    const externalId = cellText(get("externalId"), 200);
    const fingerprint = JSON.stringify({
      transactionDate,
      amount,
      currency,
      category,
      description,
      account,
    });
    const occurrence = (fingerprintOccurrences.get(fingerprint) ?? 0) + 1;
    fingerprintOccurrences.set(fingerprint, occurrence);
    const externalKey = sha256(
      externalId
        ? `${spreadsheetId}:id:${externalId}`
        : `${spreadsheetId}:row:${fingerprint}:${occurrence}`,
    );

    if (usedExternalKeys.has(externalKey)) {
      throw new Error(`Duplicate finance transaction id on sheet row ${index + 1}`);
    }
    usedExternalKeys.add(externalKey);

    transactions.push({
      externalKey,
      transactionDate,
      amount,
      currency,
      category,
      description,
      account,
      metadata: { sheetRow: index + 1 },
    });
  }

  return { transactions, skippedBlankRows };
}
