import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeDeploymentUrl,
  runDeploymentSmoke,
} from "../src/lib/deployment/smoke";

function securityHeaders(): HeadersInit {
  return {
    "content-security-policy":
      "default-src 'self'; object-src 'none'; frame-ancestors 'none'",
    "cross-origin-opener-policy": "same-origin",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}

function requestUrl(input: RequestInfo | URL): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

test("normalizes a production origin and permits local HTTP", () => {
  assert.equal(
    normalizeDeploymentUrl("https://os.example.com/"),
    "https://os.example.com",
  );
  assert.equal(
    normalizeDeploymentUrl("http://127.0.0.1:3000/"),
    "http://127.0.0.1:3000",
  );
});

test("rejects unsafe or non-origin deployment URLs", () => {
  assert.throws(() => normalizeDeploymentUrl("http://os.example.com"));
  assert.throws(() => normalizeDeploymentUrl("https://user:pass@example.com"));
  assert.throws(() => normalizeDeploymentUrl("https://example.com/private"));
});

test("passes passive smoke checks for a protected deployment", async () => {
  const mockFetch: typeof fetch = async (input) => {
    const url = requestUrl(input);
    if (url.pathname === "/login") {
      return new Response("<title>HinkoK OS</title>", {
        status: 200,
        headers: securityHeaders(),
      });
    }
    if (url.pathname === "/") {
      return new Response(null, {
        status: 307,
        headers: { location: "/login?next=%2F" },
      });
    }
    if (url.pathname === "/api/memory/search") {
      return Response.json(
        { ok: false, error: "unauthorized" },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
    if (url.pathname === "/api/insights/weekly") {
      return Response.json({ ok: false }, { status: 401 });
    }
    return new Response(null, { status: 404 });
  };

  const checks = await runDeploymentSmoke("https://os.example.com", {
    fetchImplementation: mockFetch,
  });
  assert.equal(checks.length, 12);
  assert.equal(checks.every((check) => check.ok), true);
});

test("reports a failed authentication gate without leaking a response body", async () => {
  const mockFetch: typeof fetch = async (input) => {
    const url = requestUrl(input);
    if (url.pathname === "/login") {
      return new Response("HinkoK OS", {
        status: 200,
        headers: securityHeaders(),
      });
    }
    if (url.pathname === "/") {
      return new Response("private page leaked", { status: 200 });
    }
    if (url.pathname === "/api/memory/search") {
      return new Response("private API leaked", {
        status: 200,
        headers: { "cache-control": "public" },
      });
    }
    return new Response("unauthorized", { status: 401 });
  };

  const checks = await runDeploymentSmoke("https://os.example.com", {
    fetchImplementation: mockFetch,
  });
  assert.equal(checks.some((check) => !check.ok), true);
  assert.equal(JSON.stringify(checks).includes("private page leaked"), false);
  assert.equal(JSON.stringify(checks).includes("private API leaked"), false);
});

function passiveRoutes(url: URL): Response | null {
  if (url.pathname === "/login") {
    return new Response("<title>HinkoK OS</title>", {
      status: 200,
      headers: securityHeaders(),
    });
  }
  if (url.pathname === "/api/memory/search") {
    return Response.json(
      { ok: false, error: "unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  if (url.pathname === "/api/insights/weekly") {
    return Response.json({ ok: false }, { status: 401 });
  }
  return null;
}

test("authenticated smoke checks accept a session cookie with correct security flags", async () => {
  const mockFetch: typeof fetch = async (input, init) => {
    const url = requestUrl(input);
    const passive = passiveRoutes(url);
    if (passive) return passive;
    if (url.pathname === "/") {
      return new Response(null, {
        status: 307,
        headers: { location: "/login?next=%2F" },
      });
    }
    if (url.pathname === "/api/auth/login" && init?.method === "POST") {
      return new Response(null, {
        status: 200,
        headers: {
          "set-cookie":
            "__Host-hinkok_session=abc123; Path=/; HttpOnly; Secure; SameSite=Strict",
        },
      });
    }
    if (url.pathname === "/brain") {
      return new Response("<html>weekly review</html>", {
        status: 200,
        headers: { "cache-control": "no-store" },
      });
    }
    if (url.pathname === "/api/auth/logout" && init?.method === "POST") {
      return new Response(null, {
        status: 204,
        headers: {
          "set-cookie":
            "__Host-hinkok_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
        },
      });
    }
    return new Response(null, { status: 404 });
  };

  const checks = await runDeploymentSmoke("https://os.example.com", {
    fetchImplementation: mockFetch,
    dashboardPassword: "correct horse battery staple",
  });
  assert.equal(
    checks.every((check) => check.ok),
    true,
    JSON.stringify(checks.filter((check) => !check.ok)),
  );
  assert.equal(
    checks.some((check) => check.name === "session cookie __Host- prefix"),
    true,
  );
  assert.equal(
    checks.some((check) => check.name === "logout clears session cookie"),
    true,
  );
});

test("authenticated smoke checks catch a session cookie missing security flags", async () => {
  const mockFetch: typeof fetch = async (input, init) => {
    const url = requestUrl(input);
    const passive = passiveRoutes(url);
    if (passive) return passive;
    if (url.pathname === "/") {
      return new Response(null, {
        status: 307,
        headers: { location: "/login?next=%2F" },
      });
    }
    if (url.pathname === "/api/auth/login" && init?.method === "POST") {
      // Regression: cookie value present but missing HttpOnly/Secure/SameSite/__Host- prefix.
      return new Response(null, {
        status: 200,
        headers: { "set-cookie": "hinkok_session=abc123; Path=/" },
      });
    }
    if (url.pathname === "/brain") {
      return new Response("<html>weekly review</html>", {
        status: 200,
        headers: { "cache-control": "no-store" },
      });
    }
    if (url.pathname === "/api/auth/logout" && init?.method === "POST") {
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  };

  const checks = await runDeploymentSmoke("https://os.example.com", {
    fetchImplementation: mockFetch,
    dashboardPassword: "correct horse battery staple",
  });
  const failed = checks.filter((check) => !check.ok).map((check) => check.name);
  assert.equal(failed.includes("session cookie HttpOnly"), true);
  assert.equal(failed.includes("session cookie Secure"), true);
  assert.equal(failed.includes("session cookie SameSite=Strict"), true);
  assert.equal(failed.includes("session cookie __Host- prefix"), true);
  assert.equal(failed.includes("logout clears session cookie"), true);
});
