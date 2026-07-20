import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env/server";

const PENDING_LOGIN_VERSION = 1;
const PENDING_LOGIN_TTL_SECONDS = 5 * 60;
const MAX_PENDING_LOGIN_TOKEN_LENGTH = 1024;

type PendingLoginPayload = {
  version: number;
  purpose: "totp-pending";
  subject: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

function sign(encodedPayload: string): Buffer {
  return createHmac("sha256", serverEnv.AUTH_SECRET)
    .update(encodedPayload, "utf8")
    .digest();
}

export function createPendingLoginToken(now = new Date()): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload: PendingLoginPayload = {
    version: PENDING_LOGIN_VERSION,
    purpose: "totp-pending",
    subject: serverEnv.USER_ID,
    issuedAt,
    expiresAt: issuedAt + PENDING_LOGIN_TTL_SECONDS,
    nonce: randomBytes(16).toString("base64url"),
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = sign(encodedPayload).toString("base64url");

  return `${encodedPayload}.${signature}`;
}

function isPendingLoginPayload(value: unknown): value is PendingLoginPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;

  return (
    Object.keys(candidate).length === 6 &&
    candidate.version === PENDING_LOGIN_VERSION &&
    candidate.purpose === "totp-pending" &&
    typeof candidate.subject === "string" &&
    candidate.subject === serverEnv.USER_ID &&
    typeof candidate.issuedAt === "number" &&
    Number.isSafeInteger(candidate.issuedAt) &&
    typeof candidate.expiresAt === "number" &&
    Number.isSafeInteger(candidate.expiresAt) &&
    typeof candidate.nonce === "string" &&
    /^[a-zA-Z0-9_-]{22}$/.test(candidate.nonce)
  );
}

export function verifyPendingLoginToken(
  token: string | null | undefined,
  now = new Date(),
): boolean {
  if (!token || token.length > MAX_PENDING_LOGIN_TOKEN_LENGTH) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [encodedPayload, encodedSignature] = parts;
  if (!encodedPayload || !encodedSignature) return false;

  let suppliedSignature: Buffer;
  let payload: unknown;

  try {
    suppliedSignature = Buffer.from(encodedSignature, "base64url");
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as unknown;
  } catch {
    return false;
  }

  const expectedSignature = sign(encodedPayload);
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return false;
  }

  if (!isPendingLoginPayload(payload)) return false;

  const nowSeconds = Math.floor(now.getTime() / 1000);
  return (
    payload.issuedAt <= nowSeconds &&
    payload.expiresAt > nowSeconds &&
    payload.expiresAt <= payload.issuedAt + PENDING_LOGIN_TTL_SECONDS
  );
}
