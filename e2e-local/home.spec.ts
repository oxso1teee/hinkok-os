import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

const LOCAL_PASSWORD = process.env.PLAYWRIGHT_LOCAL_PASSWORD ?? "";

/** Undoes this spec's one persistent write so the local seed stays rerunnable. */
function resetCompletedTask(title: string): void {
  execFileSync("psql", [
    "-h", "127.0.0.1", "-p", "5544", "-U", "postgres", "-d", "hinkok",
    "-c", `update public.tasks set completed_at = null where title = '${title.replace(/'/gu, "''")}';`,
  ], { env: { ...process.env, PGPASSWORD: "localtestpw" } });
}

test.beforeEach(async ({ page }) => {
  if (!LOCAL_PASSWORD) {
    throw new Error("Set PLAYWRIGHT_LOCAL_PASSWORD to the local DASHBOARD_PASSWORD before running e2e-local specs.");
  }
  await page.goto("/login");
  await page.getByLabel("Пароль").fill(LOCAL_PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL("**/");
});

test("quick capture: on a failed save the text stays in the field and an error is shown", async ({ page }) => {
  // [P0-HOME-01] verify-quick-capture-error-surface
  await page.route("**/api/captures", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "internal_error" }),
    });
  });

  const captureText = "Проверка захвата, который не должен потеряться";
  const input = page.getByLabel("Быстрый захват");
  await input.fill(captureText);
  await page.getByLabel("Сохранить захват").click();

  await expect(page.locator(".capture-bar")).toHaveClass(/error/);
  await expect(input).toHaveValue(captureText);
});

test("quick capture: a successful save clears the field", async ({ page }) => {
  const input = page.getByLabel("Быстрый захват");
  await input.fill(`E2E home capture ${Date.now()}`);

  const captureResponse = page.waitForResponse(
    (response) => response.url().includes("/api/captures") && response.request().method() === "POST",
  );
  await page.getByLabel("Сохранить захват").click();
  // The real classification pipeline (Anthropic -> OpenAI -> regex fallback,
  // see [P0-AI-01]) runs synchronously here with placeholder local API keys,
  // so this can take noticeably longer than a plain DB write.
  await captureResponse;

  await expect(page.locator(".capture-bar")).toHaveClass(/saved/, { timeout: 15_000 });
  await expect(input).toHaveValue("");
});

test("toggles a habit and the progress count updates", async ({ page }) => {
  const habit = page.locator(".habit-card", { hasText: "Медитация" });
  await expect(habit).toBeVisible();
  const wasComplete = (await habit.getAttribute("class"))?.includes("is-complete") ?? false;

  const actionResponse = page.waitForResponse(
    (response) => response.url().includes("/api/home/actions") && response.request().method() === "POST",
  );
  await habit.click();
  await actionResponse;

  await expect(async () => {
    const isCompleteNow = (await habit.getAttribute("class"))?.includes("is-complete") ?? false;
    expect(isCompleteNow).toBe(!wasComplete);
  }).toPass({ timeout: 10_000 });
});

test("completes a key task from the Home task list", async ({ page }) => {
  const task = page.locator(".task-row", { hasText: "Ответить на комментарии под прошлым роликом" });
  await expect(task).toBeVisible();

  const actionResponse = page.waitForResponse(
    (response) => response.url().includes("/api/home/actions") && response.request().method() === "POST",
  );
  await task.click();
  await actionResponse;

  await expect(page.locator(".task-row", { hasText: "Ответить на комментарии под прошлым роликом" })).toHaveCount(0, { timeout: 10_000 });
  resetCompletedTask("Ответить на комментарии под прошлым роликом");
});
