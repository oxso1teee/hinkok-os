import assert from "node:assert/strict";
import test from "node:test";

import { applyOptimisticTaskMove } from "../src/lib/crm/optimistic";
import type { CrmTask } from "../src/lib/crm/normalize";

function task(id: string, urgency: CrmTask["urgency"]): CrmTask {
  return {
    id, title: id, description: null, urgency, category: "personal", sphere: "personal",
    key: false, priorityScore: 10, timeEstimateMin: null, tags: [], dueDate: null,
    entityId: null, entityName: null, completedAt: null, boardPosition: 1024,
    createdAt: "2026-07-18T10:00:00.000Z", updatedAt: "2026-07-18T10:00:00.000Z",
  };
}

test("optimistic move inserts before an anchor and changes urgency", () => {
  const moved = applyOptimisticTaskMove(
    [task("first", "today"), task("second", "tomorrow"), task("third", "tomorrow")],
    "first", "tomorrow", "third",
  );
  assert.deepEqual(moved.map((item) => item.id), ["second", "first", "third"]);
  assert.equal(moved[1].urgency, "tomorrow");
});

test("optimistic move appends to the target column", () => {
  const moved = applyOptimisticTaskMove(
    [task("first", "today"), task("second", "tomorrow")],
    "first", "tomorrow", null,
  );
  assert.deepEqual(moved.map((item) => item.id), ["second", "first"]);
});

test("optimistic move leaves input immutable", () => {
  const source = [task("first", "today"), task("second", "tomorrow")];
  const moved = applyOptimisticTaskMove(source, "first", "tomorrow", "second");
  assert.equal(source[0].urgency, "today");
  assert.notEqual(moved, source);
});
