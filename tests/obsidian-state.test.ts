import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyObsidianSyncState,
  parseObsidianSyncState,
} from "../src/lib/obsidian/state";

const SHA = "a".repeat(40);

test("parses a valid cached Obsidian tree snapshot", () => {
  const state = parseObsidianSyncState({
    version: 1,
    mappingVersion: 1,
    treeSha: SHA,
    embeddingModel: "text-embedding-3-small",
    files: {
      "Work/Plan.md": {
        sha: SHA,
        sourceKey: "obsidian:owner/repo:Work/Plan.md",
        sphere: "work",
      },
    },
  });

  assert.equal(state?.treeSha, SHA);
  assert.equal(state?.files["Work/Plan.md"].sphere, "work");
});

test("fails closed for malformed cached state", () => {
  assert.equal(
    parseObsidianSyncState({
      version: 1,
      mappingVersion: 1,
      treeSha: "not-a-sha",
      embeddingModel: "text-embedding-3-small",
      files: {},
    }),
    null,
  );
});

test("creates a deterministic empty state", () => {
  const state = createEmptyObsidianSyncState("text-embedding-3-small");
  assert.equal(state.treeSha, "0".repeat(40));
  assert.deepEqual(state.files, {});
});
