import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { googleEnv } from "@/lib/env/google";

function key(): Buffer {
  const raw = googleEnv.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("Google token encryption is not configured");
  const decoded = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  return decoded.length === 32 ? decoded : createHash("sha256").update(raw).digest();
}

export function encryptGoogleToken(value: string): string {
  if (!value) throw new Error("Cannot encrypt an empty Google token");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptGoogleToken(payload: string): string {
  const [version, ivPart, tagPart, encryptedPart] = payload.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !encryptedPart) throw new Error("Invalid encrypted Google token payload");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedPart, "base64url")), decipher.final()]).toString("utf8");
}
