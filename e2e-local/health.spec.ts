import { expect, test } from "@playwright/test";

const LOCAL_PASSWORD = process.env.PLAYWRIGHT_LOCAL_PASSWORD ?? "";
const REST_BASE = "http://127.0.0.1:5556";
const SERVICE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtbG9jYWwiLCJpYXQiOjE3ODQ1Njk5NzYsImV4cCI6MjA5OTkyOTk3Nn0.GwI_nQ9rT5mFPnu6ajyskem3cx7zgeJbW5UyC4IyO-w";

function restHeaders(extra?: Record<string, string>) {
  return {
    apikey: SERVICE_JWT,
    Authorization: `Bearer ${SERVICE_JWT}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/**
 * Reads and restores the *whole* `notes` jsonb blob for a daily_logs row
 * (not just its `activity` key) so a test that clears health activity for a
 * day never destroys an unrelated journal entry saved in the same row by a
 * different spec file.
 */
async function readNotes(date: string): Promise<unknown> {
  const response = await fetch(
    `${REST_BASE}/daily_logs?user_id=eq.local-dev-user&log_date=eq.${date}&select=notes`,
    { headers: restHeaders() },
  );
  const rows = (await response.json()) as Array<{ notes: unknown }>;
  return rows[0]?.notes;
}

async function clearActivity(date: string): Promise<void> {
  const notes = (await readNotes(date)) as Record<string, unknown> | undefined;
  const withoutActivity = { ...(notes ?? {}) };
  delete withoutActivity.activity;
  await fetch(`${REST_BASE}/daily_logs?user_id=eq.local-dev-user&log_date=eq.${date}`, {
    method: "PATCH",
    headers: restHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ notes: withoutActivity }),
  });
}

async function restoreNotes(date: string, notes: unknown): Promise<void> {
  if (notes === undefined) return;
  await fetch(`${REST_BASE}/daily_logs?user_id=eq.local-dev-user&log_date=eq.${date}`, {
    method: "PATCH",
    headers: restHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({ notes }),
  });
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

test("shows real seeded metric values, not placeholders", async ({ page }) => {
  await page.goto("/health");
  const grid = page.locator(".health-metric-grid");
  await expect(grid).toContainText(/\d/);
});

test("stale metrics visibly disclose their date instead of hiding it in a tooltip", async ({ page }) => {
  // [P0-HEALTH-02] verify-stale-date-disclosure
  const today = new Date().toISOString().slice(0, 10);
  const backup = await readNotes(today);
  try {
    await clearActivity(today);

    await page.goto("/health");
    const context = page.locator(".health-metric-card header small").first();
    await expect(context).toBeVisible();
    const text = (await context.textContent()) ?? "";
    expect(text).not.toBe("today");
    expect(text.length).toBeGreaterThan(0);
  } finally {
    await restoreNotes(today, backup);
  }
});

test("a day with no synced data renders a visible gap, not an interpolated line", async ({ page }) => {
  // [P0-HEALTH-01] verify-no-interpolated-values
  const target = new Date();
  target.setDate(target.getDate() - 2);
  const targetDate = target.toISOString().slice(0, 10);
  const backup = await readNotes(targetDate);

  try {
    await clearActivity(targetDate);

    await page.goto("/health");
    const emptyBars = page.locator(".health-sleep-bars .empty");
    await expect(emptyBars).toHaveCount(1);
  } finally {
    await restoreNotes(targetDate, backup);
  }
});
