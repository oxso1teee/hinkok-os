import { defineConfig, devices } from "@playwright/test";

/**
 * A second, local-only Playwright config for specs that need a real backing
 * database (Postgres + PostgREST), unlike `playwright.config.ts`'s fully
 * hermetic, secret-free `npm run e2e` gate (see `docs/E2E_QA.md`). It never
 * starts its own server: point it at an already-running `npm run dev`
 * instance backed by a real (local) Supabase-compatible stack and a logged-in
 * session, and pass PLAYWRIGHT_LOCAL_BASE_URL / PLAYWRIGHT_LOCAL_PASSWORD.
 * See docs/E2E_QA.md, "Local real-database specs" for the full setup.
 */
export default defineConfig({
  testDir: "./e2e-local",
  outputDir: "test-results/e2e-local",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_LOCAL_BASE_URL ?? "http://localhost:3000",
    locale: "ru-RU",
    timezoneId: "Europe/Riga",
    colorScheme: "dark",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
