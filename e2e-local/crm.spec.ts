import { expect, test } from "@playwright/test";

/**
 * Runs against a real, already-authenticated dev server backed by a real
 * Postgres + PostgREST stack (see docs/E2E_QA.md, "Local real-database
 * specs"). Unlike e2e/*.spec.ts this is not part of the hermetic `npm run
 * e2e` CI gate: the CRM dashboard's initial load alone issues 8 parallel
 * Supabase queries (tasks, archive, entities, four counts), which the
 * lightweight mock in scripts/e2e-server.ts deliberately does not attempt to
 * replicate (see docs/E2E_QA.md for the isolation rationale and why that
 * mock only understands the two auth-flow operations it was built for).
 */

const LOCAL_PASSWORD = process.env.PLAYWRIGHT_LOCAL_PASSWORD ?? "";

test.beforeEach(async ({ page }) => {
  if (!LOCAL_PASSWORD) {
    throw new Error("Set PLAYWRIGHT_LOCAL_PASSWORD to the local DASHBOARD_PASSWORD before running e2e-local specs.");
  }
  await page.goto("/login");
  await page.getByLabel("Пароль").fill(LOCAL_PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL("**/");

  await page.goto("/crm");
  await expect(page.locator("h1")).toContainText("moving");
});

test("filters tasks by free-text search", async ({ page }) => {
  const filter = page.getByLabel("Фильтр задач");
  await filter.fill("черновик ролика");
  await expect(page.locator(".crm-task-card")).toHaveCount(1);
  await expect(page.locator(".crm-task-card").first()).toContainText("черновик ролика");

  await filter.fill("");
  const countAfterClear = await page.locator(".crm-task-card").count();
  expect(countAfterClear).toBeGreaterThan(1);
});

test("creates a task and it lands in the selected column", async ({ page }) => {
  const title = `E2E тестовая задача ${Date.now()}`;
  await page.locator(".crm-new-button").click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.getByLabel("Название").fill(title);
  await page.getByLabel("Срок").selectOption("next_week");
  await page.getByRole("button", { name: "Создать задачу" }).click();

  await expect(page.getByRole("dialog")).toBeHidden();
  const column = page.locator(".crm-column", { hasText: "NEXT WEEK" });
  await expect(column.locator(".crm-task-card", { hasText: title })).toBeVisible();
});

test("moves a task between columns via the urgency select", async ({ page }) => {
  const card = page.locator(".crm-task-card", { hasText: "Позвонить родителям" });
  await expect(card).toBeVisible();

  const move = card.getByLabel(/Переместить задачу/);
  await move.selectOption("today");

  await expect(page.locator(".crm-column", { hasText: "TODAY" }).locator(".crm-task-card", { hasText: "Позвонить родителям" })).toBeVisible();
  await expect(page.locator(".crm-column", { hasText: "TOMORROW" }).locator(".crm-task-card", { hasText: "Позвонить родителям" })).toHaveCount(0);
});

test("completes a task and restores it from the archive", async ({ page }) => {
  const card = page.locator(".crm-task-card", { hasText: "Прочитать книгу про привычки" });
  await expect(card).toBeVisible();

  await card.getByLabel(/Завершить/).click();
  await expect(card).toHaveCount(0);

  await page.getByRole("button", { name: "ARCHIVE" }).click();
  const archived = page.locator(".crm-task-card", { hasText: "Прочитать книгу про привычки" });
  await expect(archived).toBeVisible();

  await archived.getByLabel(/Вернуть/).click();
  await expect(archived).toHaveCount(0);
  await page.getByRole("button", { name: "KANBAN" }).click();
  await expect(page.locator(".crm-task-card", { hasText: "Прочитать книгу про привычки" })).toBeVisible();
});

test("drags a task card between columns with the mouse", async ({ page }) => {
  const card = page.locator(".crm-task-card", { hasText: "Тренировка: ноги" });
  await expect(card).toBeVisible();
  // The @dnd-kit useDraggable listeners are bound only to the small grip
  // handle inside the card (`.crm-drag-handle`), not the whole card body —
  // the mouse-down has to start there or no drag is ever registered.
  const handle = card.locator(".crm-drag-handle");
  const targetColumn = page.locator(".crm-column", { hasText: "THIS WEEK" });

  const source = await handle.boundingBox();
  const target = await targetColumn.boundingBox();
  if (!source || !target) throw new Error("Could not measure drag source/target");

  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  // Exceed the MouseSensor `distance: 6` activation constraint before
  // heading toward the drop target, mirroring a real drag gesture.
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2 - 15, { steps: 5 });
  await page.mouse.move(target.x + target.width / 2, target.y + 150, { steps: 15 });
  await page.mouse.up();

  await expect(targetColumn.locator(".crm-task-card", { hasText: "Тренировка: ноги" })).toBeVisible();
});

test("rolls back an optimistic move when the server returns a 500", async ({ page }) => {
  // Delay the forced failure slightly so the transient optimistic state is
  // actually observable instead of racing Playwright's own assertion poll.
  await page.route("**/api/crm/tasks", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "internal_error" }),
    });
  });

  const card = page.locator(".crm-task-card", { hasText: "Настроить cron для weekly recap" });
  await expect(card).toBeVisible();
  const move = card.getByLabel(/Переместить задачу/);
  await move.selectOption("someday");

  // Optimistic UI applies the move immediately...
  await expect(page.locator(".crm-column", { hasText: "SOMEDAY" }).locator(".crm-task-card", { hasText: "Настроить cron" })).toBeVisible();
  // ...then rolls back once the forced 500 comes back.
  await expect(page.locator(".crm-column", { hasText: "THIS WEEK" }).locator(".crm-task-card", { hasText: "Настроить cron" })).toBeVisible();
  await expect(page.locator(".crm-toast")).toContainText("отменено");
});
