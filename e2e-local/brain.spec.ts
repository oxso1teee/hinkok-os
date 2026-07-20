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
  await page.goto("/brain");
});

test("switching spheres updates the briefing panel", async ({ page }) => {
  const financeSphere = page.locator(".brain-spheres button", { hasText: "Finance" });
  await financeSphere.click();
  await expect(financeSphere).toHaveClass(/active/);
  await expect(page.locator(".brain-sphere-head h2")).toContainText(/./);
});

test("Ask the OS renders a mocked answer with a valid citation link", async ({ page }) => {
  await page.route("**/api/memory/query", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        answer: "Ты закрыл монтаж вовремя [ref:1].",
        provider: "extractive",
        sources: [
          { ref: 1, label: "N1", title: "Заметка про монтаж", sourceType: "obsidian_note", href: "#memory-source-1", excerpt: "..." },
        ],
      }),
    });
  });

  await page.getByLabel("Вопрос к персональной памяти").fill("Что я делал на этой неделе?");
  await page.getByRole("button", { name: "ask", exact: true }).click();

  await expect(page.locator(".brain-answer")).toBeVisible();
  await expect(page.locator(".brain-inline-ref")).toHaveText("[ref: N1]");
});

test("Ask the OS: a citation with no matching source degrades to plain text, not a crash", async ({ page }) => {
  // [P0-BRAIN-02] verify-source-links-are-real: the answer cites a ref the
  // sources array does not contain (e.g. a re-indexed/deleted note).
  await page.route("**/api/memory/query", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        answer: "Смотри дальше [ref:99] для деталей.",
        provider: "extractive",
        sources: [],
      }),
    });
  });

  await page.getByLabel("Вопрос к персональной памяти").fill("Что-то устаревшее");
  await page.getByRole("button", { name: "ask", exact: true }).click();

  await expect(page.locator(".brain-answer")).toBeVisible();
  await expect(page.locator(".brain-inline-ref")).toHaveCount(0);
  await expect(page.locator(".brain-answer-copy p")).toContainText("[ref:99]");
});

test("generates a briefing for the active sphere from a mocked response", async ({ page }) => {
  await page.route("**/api/brain/briefing", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        briefing: {
          sphere: "work",
          text: "E2E mocked briefing text for the work sphere.",
          provider: "extractive",
          generatedAt: new Date().toISOString(),
        },
      }),
    });
  });

  await page.getByRole("button", { name: /^generate$/ }).first().click();
  await expect(page.locator(".brain-briefing-copy")).toContainText("E2E mocked briefing text", { timeout: 10_000 });
});
