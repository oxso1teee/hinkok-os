import { createHmac, randomBytes } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: bigint): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);

  const hmac = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function totpStepForTime(unixSeconds: number): bigint {
  return BigInt(Math.floor(unixSeconds / TOTP_STEP_SECONDS));
}

export function generateTotpCode(
  secretBase32: string,
  unixSeconds: number = Date.now() / 1000,
): string {
  return hotp(base32Decode(secretBase32), totpStepForTime(unixSeconds));
}

/**
 * Verifies a code within a +/-1 step window (RFC 6238's own recommended
 * tolerance for clock drift) and returns the matched step, so the caller can
 * reject reuse of that exact step (replay protection) without this module
 * needing to know about storage.
 */
export function verifyTotpCode(
  secretBase32: string,
  code: string,
  unixSeconds: number = Date.now() / 1000,
  windowSteps = 1,
): { valid: boolean; step: bigint | null } {
  if (!/^\d{6}$/.test(code)) return { valid: false, step: null };

  const secret = base32Decode(secretBase32);
  const currentStep = totpStepForTime(unixSeconds);

  for (let delta = -windowSteps; delta <= windowSteps; delta += 1) {
    const step = currentStep + BigInt(delta);
    if (step < BigInt(0)) continue;
    if (hotp(secret, step) === code) {
      return { valid: true, step };
    }
  }

  return { valid: false, step: null };
}

export function totpAuthUri(
  secretBase32: string,
  accountLabel: string,
  issuer = "HinkoK OS",
): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}
