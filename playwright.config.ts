import { defineConfig, devices } from "@playwright/test";

import { E2E_APP_ORIGIN } from "./e2e/constants";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ["line"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
      ]
    : [
        ["list"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
      ],
  use: {
    baseURL: E2E_APP_ORIGIN,
    locale: "ru-RU",
    timezoneId: "Europe/Riga",
    colorScheme: "dark",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
  webServer: {
    command: "npm run e2e:serve",
    url: `${E2E_APP_ORIGIN}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
