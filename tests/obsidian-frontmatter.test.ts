import assert from "node:assert/strict";
import test from "node:test";

import { parseObsidianMarkdown } from "../src/lib/obsidian/frontmatter";

test("extracts bounded Obsidian frontmatter and Markdown body", () => {
  const parsed = parseObsidianMarkdown(`---
title: "План недели"
created: 2026-07-19
tags: [work, planning, "deep focus"]
aliases: [Weekly plan]
---
# Главная цель

Закончить интеграцию.`);

  assert.equal(parsed.frontmatter.title, "План недели");
  assert.equal(parsed.frontmatter.created, "2026-07-19");
  assert.deepEqual(parsed.frontmatter.tags, ["work", "planning", "deep focus"]);
  assert.equal(parsed.body, "# Главная цель\n\nЗакончить интеграцию.");
});

test("preserves Markdown when frontmatter is absent or malformed", () => {
  const ordinary = parseObsidianMarkdown("# Note\n\nText");
  assert.equal(ordinary.body, "# Note\n\nText");
  assert.deepEqual(ordinary.frontmatter.tags, []);

  const malformed = parseObsidianMarkdown("---\ntitle: unfinished\n# body");
  assert.equal(malformed.body, "---\ntitle: unfinished\n# body");
  assert.equal(malformed.frontmatter.title, null);
});
