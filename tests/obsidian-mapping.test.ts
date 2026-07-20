import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeObsidianPath,
  obsidianNoteTitle,
  obsidianSourceKey,
  selectVaultPath,
  shouldSyncObsidianPath,
  sphereForObsidianPath,
  obsidianMappingVersion,
} from "../src/lib/obsidian/mapping";

test("normalizes safe Obsidian paths and rejects traversal", () => {
  assert.equal(normalizeObsidianPath("./Клиенты\\Acme.md"), "Клиенты/Acme.md");
  assert.equal(normalizeObsidianPath("../secret.md"), null);
  assert.equal(normalizeObsidianPath("/absolute.md"), null);
  assert.equal(normalizeObsidianPath("folder/./note.md"), null);
});

test("maps configured folders to life spheres", () => {
  assert.equal(sphereForObsidianPath("Клиенты/Acme.md"), "work");
  assert.equal(sphereForObsidianPath("Архив/Ютуб/Идея.md"), "content");
  assert.equal(sphereForObsidianPath("Тренировки/Ноги.md"), "health");
  assert.equal(sphereForObsidianPath("Исследования/LLM.md"), "growth");
  assert.equal(sphereForObsidianPath("Сессии/Рефлексия.md"), "mind");
  assert.equal(sphereForObsidianPath("Дом/Покупки.md"), "personal");
});

test("uses a deterministic version for custom folder mappings", () => {
  assert.equal(
    obsidianMappingVersion({ clients: "work", books: "growth" }),
    obsidianMappingVersion({ books: "growth", clients: "work" }),
  );
  assert.notEqual(
    obsidianMappingVersion({ clients: "work" }),
    obsidianMappingVersion({ clients: "relationships" }),
  );
});

test("syncs only Markdown notes outside private vault internals and trash", () => {
  assert.equal(shouldSyncObsidianPath("Work/Plan.MD"), true);
  assert.equal(shouldSyncObsidianPath("Trash/Old.md"), false);
  assert.equal(shouldSyncObsidianPath(".obsidian/plugins/readme.md"), false);
  assert.equal(shouldSyncObsidianPath("Assets/photo.jpg"), false);
});

test("selects either a nested named vault or a repository-root vault", () => {
  assert.equal(selectVaultPath("HinkoK/Work/Plan.md", "HinkoK", true), "Work/Plan.md");
  assert.equal(selectVaultPath("README.md", "HinkoK", true), null);
  assert.equal(selectVaultPath("Work/Plan.md", "HinkoK", false), "Work/Plan.md");
});

test("creates stable source identifiers and readable titles", () => {
  assert.equal(
    obsidianSourceKey("owner/vault", "Work/Plan.md"),
    "obsidian:owner/vault:Work/Plan.md",
  );
  assert.equal(obsidianNoteTitle("Work/План.md"), "План");
});
