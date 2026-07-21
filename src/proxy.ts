import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createContentSecurityPolicy } from "@/lib/auth/csp";
import { authenticateRequest } from "@/lib/auth/request";
import {
  expiredSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/recover",
  "/api/auth/totp/verify",
  "/api/telegram/webhook",
  "/api/webhook/telegram",
  "/api/memory/sync-obsidian",
  "/api/finance/sync-google-sheets",
  "/api/insights/weekly",
  "/api/cron/sync-calendar",
  "/api/cron/backup",
]);

function applyContentSecurityPolicy(
  response: NextResponse,
  policy: string,
): NextResponse {
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

function clearInvalidSession(response: NextResponse): NextResponse {
  response.cookies.set(
    SESSION_COOKIE_NAME,
    "",
    expiredSessionCookieOptions(),
  );

  return response;
}

function continueRequest(
  request: NextRequest,
  nonce: string,
  policy: string,
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  return applyContentSecurityPolicy(response, policy);
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { nonce, policy } = createContentSecurityPolicy();
  const pathname = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.has(pathname);
  const authentication = await authenticateRequest(request);

  if (pathname === "/login" && authentication.authenticated) {
    return applyContentSecurityPolicy(
      NextResponse.redirect(new URL("/", request.url)),
      policy,
    );
  }

  if (isPublicPath) {
    return continueRequest(request, nonce, policy);
  }

  if (authentication.authenticated) {
    return continueRequest(request, nonce, policy);
  }

  const hasInvalidSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);

  if (pathname.startsWith("/api/")) {
    const response = applyContentSecurityPolicy(
      NextResponse.json(
        { ok: false, error: "unauthorized" },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        },
      ),
      policy,
    );

    return hasInvalidSessionCookie
      ? clearInvalidSession(response)
      : response;
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  const response = applyContentSecurityPolicy(
    NextResponse.redirect(loginUrl),
    policy,
  );

  return hasInvalidSessionCookie
    ? clearInvalidSession(response)
    : response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|offline.html|icon-192.png|icon-512.png|icon-maskable-512.png|apple-touch-icon.png).*)",
  ],
};
