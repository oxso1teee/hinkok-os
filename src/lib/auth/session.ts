import "server-only";

import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import {
  MAX_SESSION_COOKIE_LENGTH,
  SESSION_CLOCK_SKEW_SECONDS,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  SESSION_VERSION,
} from "@/lib/auth/constants";
import { serverEnv } from "@/lib/env/server";

export type SessionPayload = {
  version: number;
  subject: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  sessionId: string;
};

export type SessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "strict";
  path: "/";
  expires: Date;
  priority: "high";
  maxAge?: number;
};

function sign(encodedPayload: string): Buffer {
  return createHmac("sha256", serverEnv.AUTH_SECRET)
    .update(encodedPayload, "utf8")
    .digest();
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    Object.keys(candidate).length === 6 &&
    candidate.version === SESSION_VERSION &&
    typeof candidate.subject === "string" &&
    candidate.subject === serverEnv.USER_ID &&
    typeof candidate.issuedAt === "number" &&
    Number.isSafeInteger(candidate.issuedAt) &&
    typeof candidate.expiresAt === "number" &&
    Number.isSafeInteger(candidate.expiresAt) &&
    typeof candidate.nonce === "string" &&
    /^[a-zA-Z0-9_-]{22}$/.test(candidate.nonce) &&
    typeof candidate.sessionId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      candidate.sessionId,
    )
  );
}

export function createSessionToken(now = new Date()): {
  token: string;
  payload: SessionPayload;
} {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: SessionPayload = {
    version: SESSION_VERSION,
    subject: serverEnv.USER_ID,
    issuedAt,
    expiresAt: issuedAt + SESSION_TTL_SECONDS,
    nonce: randomBytes(16).toString("base64url"),
    sessionId: randomUUID(),
  };

  const encodedPayload = Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");
  const signature = sign(encodedPayload).toString("base64url");

  return {
    token: `${encodedPayload}.${signature}`,
    payload,
  };
}

export function verifySessionToken(
  token: string | null | undefined,
  now = new Date(),
): SessionPayload | null {
  if (!token || token.length > MAX_SESSION_COOKIE_LENGTH) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, encodedSignature] = parts;
  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  let suppliedSignature: Buffer;
  let payload: unknown;

  try {
    suppliedSignature = Buffer.from(encodedSignature, "base64url");
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as unknown;
  } catch {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return null;
  }

  if (!isSessionPayload(payload)) {
    return null;
  }

  const nowSeconds = Math.floor(now.getTime() / 1000);
  const maxAllowedExpiry =
    payload.issuedAt + SESSION_TTL_SECONDS + SESSION_CLOCK_SKEW_SECONDS;

  if (
    payload.issuedAt > nowSeconds + SESSION_CLOCK_SKEW_SECONDS ||
    payload.expiresAt <= nowSeconds ||
    payload.expiresAt > maxAllowedExpiry ||
    payload.expiresAt <= payload.issuedAt
  ) {
    return null;
  }

  return payload;
}

export function sessionCookieOptions(
  expiresAt: number,
): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(expiresAt * 1000),
    priority: "high",
  };
}

export function expiredSessionCookieOptions(): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
    priority: "high",
  };
}

export { SESSION_COOKIE_NAME };
