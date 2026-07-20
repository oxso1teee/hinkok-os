import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGroundedContext,
  buildRagSources,
  normalizeGroundedAnswer,
  type RagMatch,
} from "../src/lib/rag/references";

const match: RagMatch = {
  id: "00000000-0000-4000-8000-000000000001",
  source_type: "obsidian",
  source_id: null,
  source_key: "obsidian:owner/repo:Work/Plan.md",
  chunk_index: 0,
  text: "A useful fact from the personal note. ".repeat(20),
  metadata: {
    title: "Plan",
    path: "Work/Plan.md",
    sphere: "work",
  },
  similarity: 0.812345,
};

test("builds bounded public source references", () => {
  const sources = buildRagSources([match]);
  assert.equal(sources[0].ref, 1);
  assert.equal(sources[0].path, "Work/Plan.md");
  assert.equal(sources[0].similarity, 0.8123);
  assert.ok(sources[0].excerpt.length <= 360);
});

test("builds a model context with explicit untrusted source boundaries", () => {
  const context = buildGroundedContext([match], 1_000);
  assert.match(context, /SOURCE \[ref:1\]/);
  assert.match(context, /END SOURCE/);
  assert.ok(context.length <= 1_000);
});

test("keeps valid citations and removes invented citation numbers", () => {
  assert.equal(
    normalizeGroundedAnswer("Факт [ref:1], выдумка [ref:99].", 1),
    "Факт [ref:1], выдумка .",
  );
});

test("adds source references when a model omitted citations", () => {
  assert.equal(
    normalizeGroundedAnswer("Краткий ответ.", 2),
    "Краткий ответ.\n\nИсточники: [ref:1] [ref:2]",
  );
});
