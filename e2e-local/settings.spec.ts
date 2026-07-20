import { expect, test } from "@playwright/test";

const LOCAL_PASSWORD = process.env.PLAYWRIGHT_LOCAL_PASSWORD ?? "";

test.beforeEach(async ({ page }) => {
  if (!LOCAL_PASSWORD) {
    throw new Error("Set PLAYWRIGHT_LOCAL_PASSWORD to the local DASHBOARD_PASSWORD before running e2e-local specs.");
  }
  await page.goto("/login");
  await page.getByLabel("Пароль").fill(LOCAL_PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL("**/");
  await page.goto("/settings");
});

test("fixed sphere ids cannot be renamed from the UI, only their labels", async ({ page }) => {
  // [P0-SET-01] verify-fixed-sphere-ids-immutable-in-ui
  const workSphereCard = page.locator(".settings-spheres article", { hasText: "work" });
  await expect(workSphereCard).toBeVisible();
  // The raw id ("work") renders as plain, non-editable text...
  await expect(workSphereCard.locator("span")).toContainText("work");
  // ...and there is no input/textarea anywhere in that card containing it,
  // only the label/description fields (which start out different text).
  const editableFields = workSphereCard.locator("input, textarea");
  await expect(editableFields).toHaveCount(2);
  for (const field of await editableFields.all()) {
    await expect(field).not.toHaveValue("work");
  }
});

test("editing identity and a sphere label persists after reload", async ({ page }) => {
  const displayName = page.locator('label:has-text("Отображаемое имя") input');
  const newName = `E2E ${Date.now()}`;
  await displayName.fill(newName);

  const workLabel = page.getByLabel("Название сферы work");
  const newLabel = `Work ${Date.now()}`;
  await workLabel.fill(newLabel);

  await page.getByRole("button", { name: "SAVE SETTINGS" }).click();
  await expect(page.locator("p.saved")).toHaveText("Настройки сохранены.", { timeout: 10_000 });

  await page.reload();
  await expect(page.locator('label:has-text("Отображаемое имя") input')).toHaveValue(newName);
  await expect(page.getByLabel("Название сферы work")).toHaveValue(newLabel);
});

test("adds and removes an Obsidian folder mapping rule", async ({ page }) => {
  const folderName = `E2E-folder-${Date.now()}`;
  await page.getByLabel("Название Obsidian-папки").fill(folderName);
  await page.getByRole("button", { name: "ADD RULE" }).click();

  const rule = page.locator(".settings-folder-list > div", { hasText: folderName });
  await expect(rule).toBeVisible();

  await rule.getByLabel(`Удалить правило ${folderName}`).click();
  await expect(page.locator(".settings-folder-list > div", { hasText: folderName })).toHaveCount(0);
});
