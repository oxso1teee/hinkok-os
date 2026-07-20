import assert from "node:assert/strict";
import test from "node:test";

import { telegramUpdateSchema } from "../src/lib/telegram/schema";

test("accepts a minimal private text update", () => {
  const parsed = telegramUpdateSchema.parse({
    update_id: 123,
    message: {
      message_id: 456,
      date: 1_753_000_000,
      chat: { id: 42, type: "private" },
      from: { id: 42, is_bot: false, first_name: "Owner" },
      text: "Новая заметка",
      unexpected: "discarded",
    },
  });

  assert.equal(parsed.message?.text, "Новая заметка");
  assert.equal("unexpected" in (parsed.message ?? {}), false);
});

test("rejects oversized callback data", () => {
  const parsed = telegramUpdateSchema.safeParse({
    update_id: 123,
    callback_query: {
      id: "callback",
      from: { id: 42, is_bot: false, first_name: "Owner" },
      data: "x".repeat(65),
    },
  });

  assert.equal(parsed.success, false);
});
