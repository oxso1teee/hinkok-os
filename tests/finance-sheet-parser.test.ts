import assert from "node:assert/strict";
import test from "node:test";

import { parseFinanceSheet } from "../src/lib/finance/sheet-parser";

test("parses Russian finance headers and localized values", () => {
  const result = parseFinanceSheet(
    [
      ["Дата", "Сумма", "Валюта", "Категория", "Описание", "Счёт", "ID"],
      ["18.07.2026", "-1 234,56 €", "eur", "Техника", "Ноутбук", "Business", "tx-1"],
      ["", "", "", "", "", "", ""],
    ],
    "sheet-123",
  );

  assert.equal(result.transactions.length, 1);
  assert.equal(result.skippedBlankRows, 1);
  assert.deepEqual(result.transactions[0], {
    externalKey: result.transactions[0].externalKey,
    transactionDate: "2026-07-18",
    amount: -1234.56,
    currency: "EUR",
    category: "Техника",
    description: "Ноутбук",
    account: "Business",
    metadata: { sheetRow: 2 },
  });
  assert.match(result.transactions[0].externalKey, /^[a-f0-9]{64}$/);
});

test("uses a default currency and stable data-derived keys without ids", () => {
  const rows = [
    ["date", "amount", "description"],
    ["2026-07-17", 10.129, "Coffee"],
  ];
  const first = parseFinanceSheet(rows, "sheet-123", "USD");
  const second = parseFinanceSheet(rows, "sheet-123", "USD");

  assert.equal(first.transactions[0].amount, 10.13);
  assert.equal(first.transactions[0].currency, "USD");
  assert.equal(
    first.transactions[0].externalKey,
    second.transactions[0].externalKey,
  );
});

test("rejects duplicate external ids to prevent silent transaction loss", () => {
  assert.throws(
    () =>
      parseFinanceSheet(
        [
          ["date", "amount", "id"],
          ["2026-07-17", 10, "same"],
          ["2026-07-18", 20, "same"],
        ],
        "sheet-123",
      ),
    /Duplicate finance transaction id/,
  );
});

test("fails the entire parse on missing headers or malformed rows", () => {
  assert.throws(
    () => parseFinanceSheet([["category", "description"]], "sheet-123"),
    /requires date and amount/,
  );
  assert.throws(
    () =>
      parseFinanceSheet(
        [
          ["date", "amount"],
          ["31.02.2026", "12.00"],
        ],
        "sheet-123",
      ),
    /Invalid finance transaction date/,
  );
});
