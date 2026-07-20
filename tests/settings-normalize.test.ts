import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEFAULT_PERSONAL_SETTINGS,
  normalizeFolderName,
  normalizePersonalSettings,
  personalSettingsSchema,
  settingsDatabaseValues,
} from "../src/lib/settings/normalize";
import {
  obsidianMappingVersion,
  sphereForObsidianPath,
} from "../src/lib/obsidian/mapping";

function databaseRow() {
  const values = settingsDatabaseValues(structuredClone(DEFAULT_PERSONAL_SETTINGS));
  return {
    display_name: values.display_name,
    focus_statement: values.focus_statement,
    habits: values.habits,
    nutrition_targets: values.nutrition_targets,
    sphere_info: values.sphere_info,
    obsidian_folder_mapping: values.obsidian_folder_mapping,
  };
}

test("default personal settings satisfy the complete strict schema", () => {
  const parsed = personalSettingsSchema.safeParse(DEFAULT_PERSONAL_SETTINGS);
  assert.equal(parsed.success, true);
  assert.equal(DEFAULT_PERSONAL_SETTINGS.habits.length, 6);
  assert.equal(Object.keys(DEFAULT_PERSONAL_SETTINGS.sphereInfo).length, 9);
});

test("normalizes a valid database row into application field names", () => {
  const normalized = normalizePersonalSettings(databaseRow());
  assert.equal(normalized.displayName, "HinkoK");
  assert.equal(normalized.nutritionTargets.kcal, 2_400);
  assert.equal(normalized.sphereInfo.health.label, "Health");
});

test("falls back as one coherent settings snapshot when stored JSON is malformed", () => {
  const row = databaseRow();
  row.habits = [{ id: "INVALID ID", label: "Unsafe", eyebrow: "x", target: 1 }];
  const normalized = normalizePersonalSettings(row);
  assert.deepEqual(normalized, DEFAULT_PERSONAL_SETTINGS);
  assert.notEqual(normalized, DEFAULT_PERSONAL_SETTINGS);
});

test("rejects duplicate habit ids and unsafe Obsidian folder keys", () => {
  const duplicate = structuredClone(DEFAULT_PERSONAL_SETTINGS);
  duplicate.habits[1].id = duplicate.habits[0].id;
  assert.equal(personalSettingsSchema.safeParse(duplicate).success, false);

  const traversal = structuredClone(DEFAULT_PERSONAL_SETTINGS);
  traversal.obsidianFolderMapping["../private"] = "personal";
  assert.equal(personalSettingsSchema.safeParse(traversal).success, false);
});

test("normalizes folder names and applies a custom mapping to nested notes", () => {
  assert.equal(normalizeFolderName("  Клиенты  "), "клиенты");
  assert.equal(
    sphereForObsidianPath("Archive/Partners/Plan.md", { partners: "relationships" }),
    "relationships",
  );
  assert.equal(sphereForObsidianPath("Archive/Plan.md", {}), "personal");
});

test("mapping fingerprint is stable by key order and changes with meaning", () => {
  const first = obsidianMappingVersion({ clients: "work", books: "growth" });
  const reordered = obsidianMappingVersion({ books: "growth", clients: "work" });
  const changed = obsidianMappingVersion({ books: "mind", clients: "work" });
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
});

test("settings migration is deny-all for browser roles", () => {
  const sql = readFileSync(
    new URL(
      "../supabase/migrations/202607180013_personal_settings.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all privileges[\s\S]+from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete[\s\S]+to service_role/i);
});
