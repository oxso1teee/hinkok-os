import assert from "node:assert/strict";
import test from "node:test";

import { classifyWithRegex } from "../src/lib/capture/regex-classifier";

test("classifies an urgent Russian task", () => {
  const result = classifyWithRegex(
    "Нужно сегодня отправить клиенту договор, займёт 30 минут, это важно",
    [],
  );

  assert.equal(result.kind, "task");
  assert.equal(result.urgency, "today");
  assert.equal(result.sphere, "work");
  assert.equal(result.key, true);
  assert.equal(result.time_estimate_min, 30);
});

test("classifies meals into health", () => {
  const result = classifyWithRegex("На обед съел пасту и салат", []);

  assert.equal(result.kind, "meal");
  assert.equal(result.sphere, "health");
  assert.equal(result.urgency, "someday");
});

test("links only a visibly mentioned known entity", () => {
  const entity = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Acme",
    kind: "org" as const,
  };
  const result = classifyWithRegex(
    "Нужно на этой неделе подготовить предложение для Acme",
    [entity],
  );

  assert.equal(result.entity_id, entity.id);
  assert.equal(result.urgency, "this_week");
});

test("does not treat a keyword substring as a meal", () => {
  const result = classifyWithRegex("Победа команды была убедительной", []);

  assert.equal(result.kind, "note");
});
