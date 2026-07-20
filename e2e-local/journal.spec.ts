import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

const LOCAL_PASSWORD = process.env.PLAYWRIGHT_LOCAL_PASSWORD ?? "";

function countTodayLogs(): number {
  const output = execFileSync("psql", [
    "-h", "127.0.0.1", "-p", "5544", "-U", "postgres", "-d", "hinkok",
    "-t", "-A",
    "-c", "select count(*) from public.daily_logs where user_id = 'local-dev-user' and log_date = current_date;",
  ], { env: { ...process.env, PGPASSWORD: "localtestpw" } });
  return Number(output.toString().trim());
}

test.beforeEach(async ({ page }) => {
  if (!LOCAL_PASSWORD) {
    throw new Error("Set PLAYWRIGHT_LOCAL_PASSWORD to the local DASHBOARD_PASSWORD before running e2e-local specs.");
  }
  await page.goto("/login");
  await page.getByLabel("Пароль").fill(LOCAL_PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL("**/");
  await page.goto("/journal");
});

test("selecting a mood persists across reload", async ({ page }) => {
  const goodMood = page.getByLabel("Настроение: good");
  const moodResponse = page.waitForResponse(
    (response) => response.url().includes("/api/journal/actions") && response.request().method() === "POST",
  );
  await goodMood.click();
  await moodResponse;
  await expect(goodMood).toHaveClass(/active/);

  await page.reload();
  await expect(page.getByLabel("Настроение: good")).toHaveClass(/active/);
});

test("saving today's entry persists it and keeps a single row per day (no duplicate on double-submit)", async ({ page }) => {
  const beforeCount = countTodayLogs();

  const text = `E2E journal entry ${Date.now()}`;
  const editor = page.getByLabel("Запись в дневнике за сегодня");
  await editor.fill(text);

  const saveButton = page.getByRole("button", { name: "save entry" });
  // [P0-JOURNAL-01] verify-one-entry-per-day-race: two rapid submissions of
  // the same day's entry must never create a second daily_logs row.
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/journal/actions")),
    saveButton.click(),
  ]);
  await expect(page.getByRole("button", { name: "saved" })).toBeVisible({ timeout: 10_000 });

  await page.reload();
  await expect(page.getByLabel("Запись в дневнике за сегодня")).toHaveValue(text);

  const afterCount = countTodayLogs();
  expect(afterCount).toBe(Math.max(beforeCount, 1));
});

test("word counter updates live while typing", async ({ page }) => {
  const editor = page.getByLabel("Запись в дневнике за сегодня");
  await expect(editor).toBeEditable();
  await editor.fill("одно два три");
  await expect(page.locator(".journal-editor header p")).toHaveText("3 words", { timeout: 10_000 });
});
