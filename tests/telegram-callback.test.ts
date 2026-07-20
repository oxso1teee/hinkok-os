import assert from "node:assert/strict";
import test from "node:test";

import { TASK_URGENCIES } from "../src/lib/capture/schema";
import {
  parseTaskUrgencyCallback,
  taskUrgencyCallback,
  taskUrgencyKeyboard,
} from "../src/lib/telegram/callback";

const taskId = "11111111-1111-4111-8111-111111111111";

test("round-trips every task urgency within Telegram callback limits", () => {
  for (const urgency of TASK_URGENCIES) {
    const encoded = taskUrgencyCallback(taskId, urgency);

    assert.ok(encoded.length <= 64);
    assert.deepEqual(parseTaskUrgencyCallback(encoded), { taskId, urgency });
  }
});

test("rejects malformed or attacker-controlled callback data", () => {
  assert.equal(parseTaskUrgencyCallback("u:not-a-uuid:today"), null);
  assert.equal(parseTaskUrgencyCallback(`${"x".repeat(65)}`), null);
  assert.equal(parseTaskUrgencyCallback(`u:${taskId}:admin`), null);
});

test("builds a keyboard containing all allowed urgencies", () => {
  const keyboard = taskUrgencyKeyboard(taskId);
  const callbacks = keyboard.inline_keyboard
    .flat()
    .map((button) => parseTaskUrgencyCallback(button.callback_data)?.urgency);

  assert.deepEqual(callbacks, [...TASK_URGENCIES]);
});
