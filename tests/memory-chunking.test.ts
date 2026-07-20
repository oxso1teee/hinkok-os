import assert from "node:assert/strict";
import test from "node:test";

import {
  MEMORY_CHUNK_MAX_CHARACTERS,
  MEMORY_CHUNK_OVERLAP_CHARACTERS,
  MEMORY_CHUNK_OVERLAP_TOKENS,
  MEMORY_CHUNK_TARGET_TOKENS,
  splitMemoryText,
} from "../src/lib/memory/chunking";

test("returns normalized short text as one chunk", () => {
  assert.deepEqual(splitMemoryText("  First line.  \r\n\r\n\r\nSecond line.  "), [
    "First line.\n\nSecond line.",
  ]);
});

test("rejects empty memory text", () => {
  assert.throws(() => splitMemoryText(" \n\t "), /must not be empty/);
});

test("splits long text without exceeding the chunk limit", () => {
  const paragraphs = Array.from(
    { length: 100 },
    (_, index) => `Paragraph ${index}. ${"content ".repeat(80)}`,
  );
  const chunks = splitMemoryText(paragraphs.join("\n\n"));

  assert.ok(chunks.length > 1);
  assert.ok(
    chunks.every(
      (chunk) =>
        chunk.length > 0 && chunk.length <= MEMORY_CHUNK_MAX_CHARACTERS,
    ),
  );
});

test("targets 500-token chunks with a 100-token overlap", () => {
  assert.equal(MEMORY_CHUNK_TARGET_TOKENS, 500);
  assert.equal(MEMORY_CHUNK_OVERLAP_TOKENS, 100);

  const text = Array.from(
    { length: 7000 },
    (_, index) => String(index % 10),
  ).join("");
  const chunks = splitMemoryText(text);

  assert.ok(chunks.length > 2);
  for (let index = 1; index < chunks.length; index += 1) {
    assert.equal(
      chunks[index - 1].slice(-MEMORY_CHUNK_OVERLAP_CHARACTERS),
      chunks[index].slice(0, MEMORY_CHUNK_OVERLAP_CHARACTERS),
    );
  }
});
