export type DeploymentSmokeCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type DeploymentSmokeOptions = {
  dashboardPassword?: string;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
};

type RequestResult = {
  response: Response;
  text: string;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function normalizeDeploymentUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Deployment URL must be a valid absolute URL.");
  }

  const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(localHost && url.protocol === "http:")) {
    throw new Error("Deployment URL must use HTTPS (HTTP is allowed only locally).");
  }
  if (url.username || url.password) {
    throw new Error("Deployment URL must not include credentials.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Deployment URL must be an origin without a path, query or fragment.");
  }

  return url.origin;
}

function addCheck(
  checks: DeploymentSmokeCheck[],
  name: string,
  ok: boolean,
  detail: string,
): void {
  checks.push({ name, ok, detail });
}

async function request(
  fetchImplementation: typeof fetch,
  url: string,
  timeoutMs: number,
  init: RequestInit = {},
): Promise<RequestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImplementation(url, {
      ...init,
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": "HinkoK-OS-deployment-smoke/1.0",
        ...init.headers,
      },
    });
    return { response, text: await readBoundedText(response, 250_000) };
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedText(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let result = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytesRead += chunk.value.byteLength;
      if (bytesRead > maximumBytes) {
        await reader.cancel();
        throw new Error("Deployment response exceeded the smoke-test size limit.");
      }
      result += decoder.decode(chunk.value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock();
  }
}

function assertSecurityHeaders(
  checks: DeploymentSmokeCheck[],
  response: Response,
): void {
  const expected = [
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", "DENY"],
    ["referrer-policy", "no-referrer"],
    ["cross-origin-opener-policy", "same-origin"],
  ] as const;

  for (const [header, value] of expected) {
    addCheck(
      checks,
      `security header ${header}`,
      response.headers.get(header) === value,
      response.headers.get(header) === value ? "present" : "missing or invalid",
    );
  }

  const csp = response.headers.get("content-security-policy") ?? "";
  addCheck(
    checks,
    "content security policy",
    csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'"),
    csp ? "present" : "missing",
  );
  addCheck(
    checks,
    "framework disclosure",
    !response.headers.has("x-powered-by"),
    response.headers.has("x-powered-by") ? "x-powered-by exposed" : "hidden",
  );
}

function cookieFrom(response: Response): string | null {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return null;
  const firstCookie = setCookie.split(";", 1)[0]?.trim();
  return firstCookie?.includes("=") ? firstCookie : null;
}

function assertSessionCookieFlags(
  checks: DeploymentSmokeCheck[],
  response: Response,
  baseUrl: string,
): void {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const attributes = setCookie.split(";").map((part) => part.trim().toLowerCase());
  const cookieName = setCookie.split("=", 1)[0]?.trim() ?? "";
  const isHttps = baseUrl.startsWith("https:");

  addCheck(
    checks,
    "session cookie HttpOnly",
    attributes.includes("httponly"),
    attributes.includes("httponly") ? "present" : "missing",
  );
  addCheck(
    checks,
    "session cookie SameSite=Strict",
    attributes.includes("samesite=strict"),
    attributes.find((attr) => attr.startsWith("samesite=")) ?? "missing",
  );
  addCheck(
    checks,
    "session cookie Secure",
    !isHttps || attributes.includes("secure"),
    isHttps ? (attributes.includes("secure") ? "present" : "missing") : "skipped (http deployment)",
  );
  addCheck(
    checks,
    "session cookie __Host- prefix",
    !isHttps || cookieName.startsWith("__Host-"),
    isHttps ? cookieName : "skipped (http deployment)",
  );
}

function assertSessionCookieCleared(
  checks: DeploymentSmokeCheck[],
  response: Response,
): void {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const attributes = setCookie.split(";").map((part) => part.trim().toLowerCase());
  const maxAgeZero = attributes.includes("max-age=0");
  const expiresPast = attributes.some((attr) => {
    if (!attr.startsWith("expires=")) return false;
    const value = Date.parse(attr.slice("expires=".length));
    return Number.isFinite(value) && value <= Date.now();
  });

  addCheck(
    checks,
    "logout clears session cookie",
    Boolean(setCookie) && (maxAgeZero || expiresPast),
    setCookie ? "cleared" : "no Set-Cookie on logout",
  );
}

async function runAuthenticatedChecks(
  baseUrl: string,
  password: string,
  fetchImplementation: typeof fetch,
  timeoutMs: number,
  checks: DeploymentSmokeCheck[],
): Promise<void> {
  const login = await request(
    fetchImplementation,
    `${baseUrl}/api/auth/login`,
    timeoutMs,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: baseUrl,
      },
      body: JSON.stringify({ password, next: "/brain" }),
    },
  );
  const cookie = cookieFrom(login.response);
  addCheck(
    checks,
    "authenticated login",
    login.response.status === 200 && Boolean(cookie),
    `HTTP ${login.response.status}${cookie ? ", secure cookie received" : ", cookie missing"}`,
  );
  if (login.response.status !== 200 || !cookie) return;
  assertSessionCookieFlags(checks, login.response, baseUrl);

  const brain = await request(
    fetchImplementation,
    `${baseUrl}/brain`,
    timeoutMs,
    { headers: { Cookie: cookie } },
  );
  addCheck(
    checks,
    "authenticated BRAIN page",
    brain.response.status === 200 && brain.text.includes("weekly review"),
    `HTTP ${brain.response.status}`,
  );
  addCheck(
    checks,
    "private page cache policy",
    (brain.response.headers.get("cache-control") ?? "").includes("no-store"),
    brain.response.headers.get("cache-control") ?? "missing",
  );

  const logout = await request(
    fetchImplementation,
    `${baseUrl}/api/auth/logout`,
    timeoutMs,
    {
      method: "POST",
      headers: { Cookie: cookie, Origin: baseUrl },
    },
  );
  addCheck(
    checks,
    "authenticated logout",
    logout.response.status === 204,
    `HTTP ${logout.response.status}`,
  );
  if (logout.response.status === 204) {
    assertSessionCookieCleared(checks, logout.response);
  }
}

export async function runDeploymentSmoke(
  deploymentUrl: string,
  options: DeploymentSmokeOptions = {},
): Promise<DeploymentSmokeCheck[]> {
  const baseUrl = normalizeDeploymentUrl(deploymentUrl);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const checks: DeploymentSmokeCheck[] = [];

  const loginPage = await request(
    fetchImplementation,
    `${baseUrl}/login`,
    timeoutMs,
  );
  addCheck(
    checks,
    "public login page",
    loginPage.response.status === 200 && loginPage.text.includes("HinkoK OS"),
    `HTTP ${loginPage.response.status}`,
  );
  assertSecurityHeaders(checks, loginPage.response);

  const protectedPage = await request(
    fetchImplementation,
    `${baseUrl}/`,
    timeoutMs,
  );
  const location = protectedPage.response.headers.get("location") ?? "";
  let redirectsToLogin = false;
  try {
    redirectsToLogin = new URL(location, baseUrl).pathname === "/login";
  } catch {
    redirectsToLogin = false;
  }
  addCheck(
    checks,
    "page authentication gate",
    REDIRECT_STATUSES.has(protectedPage.response.status) && redirectsToLogin,
    `HTTP ${protectedPage.response.status}`,
  );

  const protectedApi = await request(
    fetchImplementation,
    `${baseUrl}/api/memory/search`,
    timeoutMs,
  );
  addCheck(
    checks,
    "API authentication gate",
    protectedApi.response.status === 401,
    `HTTP ${protectedApi.response.status}`,
  );
  addCheck(
    checks,
    "API cache policy",
    (protectedApi.response.headers.get("cache-control") ?? "").includes(
      "no-store",
    ),
    protectedApi.response.headers.get("cache-control") ?? "missing",
  );

  for (const [name, authorization] of [
    ["cron without authorization", undefined],
    ["cron with invalid authorization", "Bearer deployment-smoke-invalid"],
  ] as const) {
    const cron = await request(
      fetchImplementation,
      `${baseUrl}/api/insights/weekly`,
      timeoutMs,
      authorization ? { headers: { Authorization: authorization } } : {},
    );
    addCheck(
      checks,
      name,
      cron.response.status === 401,
      `HTTP ${cron.response.status}`,
    );
  }

  if (options.dashboardPassword) {
    await runAuthenticatedChecks(
      baseUrl,
      options.dashboardPassword,
      fetchImplementation,
      timeoutMs,
      checks,
    );
  }

  return checks;
}
