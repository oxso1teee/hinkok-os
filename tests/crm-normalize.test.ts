import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanCrmTags,
  moveTaskOptimistically,
  taskMatchesCrmFilters,
  type CrmTask,
} from "../src/lib/crm/normalize";

function task(overrides: Partial<CrmTask> = {}): CrmTask {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Подготовить сценарий видео",
    description: "Согласовать структуру с командой",
    urgency: "this_week",
    category: "content",
    sphere: "content",
    key: false,
    priorityScore: 45,
    timeEstimateMin: 60,
    tags: ["youtube", "запуск"],
    dueDate: null,
    entityId: null,
    entityName: "HinkoK OS",
    completedAt: null,
    boardPosition: 1024,
    createdAt: "2026-07-18T10:00:00.000Z",
    updatedAt: "2026-07-18T10:00:00.000Z",
    ...overrides,
  };
}

test("CRM filter searches normalized task context and respects category", () => {
  const candidate = task();

  assert.equal(taskMatchesCrmFilters(candidate, {
    query: "сценарий КОМАНДОЙ",
    category: "content",
    priorityOnly: false,
  }), true);
  assert.equal(taskMatchesCrmFilters(candidate, {
    query: "сценарий",
    category: "health",
    priorityOnly: false,
  }), false);
});

test("priority filter includes key tasks and high numeric priority", () => {
  assert.equal(taskMatchesCrmFilters(task({ priorityScore: 69 }), {
    query: "",
    category: "all",
    priorityOnly: true,
  }), false);
  assert.equal(taskMatchesCrmFilters(task({ key: true, priorityScore: 10 }), {
    query: "",
    category: "all",
    priorityOnly: true,
  }), true);
});

test("optimistic move inserts before an anchor and changes urgency", () => {
  const first = task({ id: "first", urgency: "today" });
  const second = task({ id: "second", urgency: "tomorrow" });
  const third = task({ id: "third", urgency: "tomorrow" });
  const moved = moveTaskOptimistically(
    [first, second, third],
    "first",
    "tomorrow",
    "third",
  );

  assert.deepEqual(moved.map((item) => item.id), ["second", "first", "third"]);
  assert.equal(moved[1].urgency, "tomorrow");
});

test("tag cleaner removes unsafe characters, duplicates and extra tags", () => {
  assert.deepEqual(
    cleanCrmTags(" Клиент, youtube, клиент, bad!, one two three four five six seven eight "),
    ["клиент", "youtube", "bad", "one", "two", "three", "four", "five"],
  );
});
