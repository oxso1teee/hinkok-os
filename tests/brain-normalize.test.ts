import assert from "node:assert/strict";
import test from "node:test";

import {
  brainTitleFromText,
  normalizeBrainNotes,
  normalizeBriefingText,
  normalizeCachedBriefing,
} from "../src/lib/brain/normalize";

test("BRAIN deduplicates vector chunks into one source note", () => {
  const notes = normalizeBrainNotes([
    {
      id: "one",
      source_type: "obsidian",
      source_key: "obsidian:vault:note",
      chunk_index: 0,
      text: "Obsidian note: План запуска\nPath: Business/launch.md\n\nFirst",
      metadata: { sphere: "work", title: "План запуска", path: "Business/launch.md" },
      created_at: "2026-07-18T10:00:00.000Z",
    },
    {
      id: "two",
      source_type: "obsidian",
      source_key: "obsidian:vault:note",
      chunk_index: 1,
      text: "Second chunk",
      metadata: { sphere: "work", title: "План запуска" },
      created_at: "2026-07-18T10:00:00.000Z",
    },
  ]);

  assert.equal(notes.length, 1);
  assert.equal(notes[0].title, "План запуска");
  assert.equal(notes[0].sphere, "work");
});

test("BRAIN excludes task captures and invalid sphere metadata", () => {
  const notes = normalizeBrainNotes([
    {
      id: "task",
      source_type: "capture",
      source_key: "task",
      chunk_index: 0,
      text: "Title: Task",
      metadata: { sphere: "work", kind: "task" },
      created_at: "2026-07-18T10:00:00.000Z",
    },
    {
      id: "bad",
      source_type: "capture",
      source_key: "bad",
      chunk_index: 0,
      text: "Title: Bad",
      metadata: { sphere: "attacker", kind: "note" },
      created_at: "2026-07-18T10:00:00.000Z",
    },
  ]);

  assert.deepEqual(notes, []);
});

test("BRAIN extracts a bounded readable title", () => {
  assert.equal(brainTitleFromText("Title:   Новая идея\n\nBody"), "Новая идея");
});

test("BRAIN rejects malformed briefing cache and cleans invented citations", () => {
  assert.equal(normalizeCachedBriefing({ sphere: "work", text: "Missing fields" }), null);
  assert.equal(normalizeBriefingText("Вывод [ref:1] [ref:3]", 2), "Вывод [ref:1]");
  assert.equal(normalizeBriefingText("Вывод без ссылки", 2), "Вывод без ссылки\n\nИсточники: [ref:1] [ref:2]");
});
