import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeClassification,
  parseJsonObject,
} from "../src/lib/capture/normalize";

const entities = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Acme",
    kind: "org" as const,
  },
];

test("normalizes untrusted classifier fields to safe defaults", () => {
  const result = normalizeClassification(
    {
      kind: "unknown",
      title: "  A title that is safe  ",
      summary: "Summary",
      urgency: "immediately",
      sphere: "unknown",
      key: "yes",
      tags: [" One Tag ", "ONE TAG", "", "two", "three", "four"],
      entity_id: "22222222-2222-4222-8222-222222222222",
      time_estimate_min: 5000,
      event_start: "tomorrow",
      event_end: "later",
    },
    "Fallback capture text",
    entities,
  );

  assert.equal(result.kind, "note");
  assert.equal(result.urgency, "someday");
  assert.equal(result.sphere, "personal");
  assert.equal(result.key, false);
  assert.deepEqual(result.tags, ["one-tag", "two", "three", "four"]);
  assert.equal(result.entity_id, null);
  assert.equal(result.time_estimate_min, null);
  assert.equal(result.event_start, null);
});

test("accepts only known entity ids and valid ordered event times", () => {
  const result = normalizeClassification(
    {
      kind: "event",
      title: "Call with Acme",
      summary: "Quarterly planning call.",
      urgency: "today",
      sphere: "work",
      key: true,
      tags: ["Planning"],
      entity_id: entities[0].id,
      time_estimate_min: 30,
      event_start: "2026-07-18T10:00:00+03:00",
      event_end: "2026-07-18T11:00:00+03:00",
    },
    "Call with Acme",
    entities,
  );

  assert.equal(result.urgency, "someday");
  assert.equal(result.entity_id, entities[0].id);
  assert.equal(result.time_estimate_min, null);
  assert.equal(result.event_start, "2026-07-18T10:00:00+03:00");
  assert.equal(result.event_end, "2026-07-18T11:00:00+03:00");
});

test("extracts a JSON object from an accidental markdown wrapper", () => {
  assert.deepEqual(parseJsonObject("```json\n{\"kind\":\"note\"}\n```"), {
    kind: "note",
  });
});
