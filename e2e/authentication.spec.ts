import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { E2E_APP_ORIGIN, E2E_PASSWORD } from "./constants";

type BrowserFailureCollector = {
  assertEmpty: () => void;
};

function collectBrowserFailures(
  page: Page,
  allowedConsoleErrors: readonly RegExp[] = [],
): BrowserFailureCollector {
  const failures: string[] = [];

  page.on("pageerror", (error) => {
    failures.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" &&
      !allowedConsoleErrors.some((pattern) => pattern.test(text))
    ) {
      failures.push(`console: ${text}`);
    }
  });

  return {
    assertEmpty: () => expect(failures).toEqual([]),
  };
}

test("redirects protected pages to login and preserves a safe return path", async ({
  page,
}) => {
  const response = await page.goto("/brain?scope=work");

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/login\?next=%2Fbrain%3Fscope%3Dwork$/);
  await expect(
    page.getByRole("heading", { name: "Защищённый вход" }),
  ).toBeVisible();

  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
});

test("fails closed for protected APIs and expires an invalid cookie", async ({
  context,
  page,
}) => {
  await context.addCookies([
    {
      name: "hinkok_session",
      value: "invalid.e2e-session",
      url: E2E_APP_ORIGIN,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);

  const response = await page.request.get("/api/ask", {
    maxRedirects: 0,
  });

  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["set-cookie"]).toContain("hinkok_session=");
  expect(response.headers()["set-cookie"]).toContain("Max-Age=0");
  await expect(response.json()).resolves.toEqual({
    ok: false,
    error: "unauthorized",
  });
});

test("login is keyboard-operable and has no detectable WCAG A or AA violations", async ({
  page,
}, testInfo) => {
  const browserFailures = collectBrowserFailures(page);
  await page.goto("/login");

  const password = page.getByLabel("Пароль");
  await expect(password).toBeFocused();
  await password.fill("temporary-value");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Войти" })).toBeFocused();

  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  await testInfo.attach("accessibility-scan", {
    body: JSON.stringify(scan, null, 2),
    contentType: "application/json",
  });
  expect(scan.violations).toEqual([]);
  browserFailures.assertEmpty();
});

test("shows a stable error for a wrong password and clears the field", async ({
  page,
}) => {
  const browserFailures = collectBrowserFailures(page, [
    /failed to load resource.+401/i,
  ]);
  await page.goto("/login");

  await page.getByLabel("Пароль").fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page.locator("#login-error")).toHaveText("Неверный пароль.");
  await expect(page.getByLabel("Пароль")).toHaveValue("");
  await expect(page).toHaveURL(/\/login$/);
  browserFailures.assertEmpty();
});

test("creates a hardened session, blocks open redirects and logs out", async ({
  context,
  page,
}) => {
  const browserFailures = collectBrowserFailures(page);
  await page.goto("/login?next=//attacker.example/path");

  const login = await page.evaluate(async (password) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        next: "//attacker.example/path",
      }),
    });

    return {
      status: response.status,
      body: (await response.json()) as unknown,
    };
  }, E2E_PASSWORD);

  expect(login).toEqual({
    status: 200,
    body: { ok: true, next: "/" },
  });

  const session = (await context.cookies()).find(
    (cookie) => cookie.name === "hinkok_session",
  );
  expect(session).toBeDefined();
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Strict");
  expect(session?.path).toBe("/");

  const authenticatedLoginPage = await page.request.get("/login", {
    maxRedirects: 0,
  });
  expect(authenticatedLoginPage.status()).toBe(307);
  expect(authenticatedLoginPage.headers().location).toBe("/");

  const logoutStatus = await page.evaluate(async () => {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    return response.status;
  });
  expect(logoutStatus).toBe(204);

  const protectedApi = await page.request.get("/api/ask", {
    maxRedirects: 0,
  });
  expect(protectedApi.status()).toBe(401);
  browserFailures.assertEmpty();
});

test("login layout does not create horizontal overflow", async ({ page }) => {
  await page.goto("/login");

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));

  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  await expect(page.locator("main.login-page")).toBeVisible();
});
