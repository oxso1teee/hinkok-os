import assert from "node:assert/strict";
import test from "node:test";

import {
  base32Decode,
  base32Encode,
  generateTotpCode,
  generateTotpSecret,
  totpAuthUri,
  verifyTotpCode,
} from "../src/lib/auth/totp";

// The official RFC 6238 (Appendix B) test vectors use the raw ASCII string
// below as the HMAC-SHA1 key and assert specific 8-digit codes at specific
// unix times. Truncating to 6 digits is `x mod 10^6`, which (since 10^6
// divides 10^8) always equals the last 6 digits of the 8-digit value — so
// these are real, independently-authored test vectors, not self-checks.
const RFC_6238_SECRET_BASE32 = base32Encode(Buffer.from("12345678901234567890", "ascii"));
const RFC_6238_VECTORS: Array<[number, string]> = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
];

test("matches every official RFC 6238 test vector", () => {
  for (const [time, expected] of RFC_6238_VECTORS) {
    assert.equal(generateTotpCode(RFC_6238_SECRET_BASE32, time), expected);
  }
});

test("base32 round-trips arbitrary byte sequences", () => {
  for (const input of [Buffer.from([]), Buffer.from([0]), Buffer.from([255]), Buffer.from("a random secret, 20 bytes!!")]) {
    assert.ok(base32Decode(base32Encode(input)).equals(input));
  }
});

test("generateTotpSecret produces a usable, decodable base32 secret", () => {
  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]+$/);
  assert.equal(base32Decode(secret).length, 20);
});

test("verifyTotpCode accepts the current code and reports its step", () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000;
  const code = generateTotpCode(secret, now);
  const result = verifyTotpCode(secret, code, now);
  assert.equal(result.valid, true);
  assert.equal(typeof result.step, "bigint");
});

test("verifyTotpCode tolerates +/-1 step of clock drift but not +/-2", () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000;
  const oneStepAgo = generateTotpCode(secret, now - 30);
  const twoStepsAgo = generateTotpCode(secret, now - 60);

  assert.equal(verifyTotpCode(secret, oneStepAgo, now).valid, true);
  assert.equal(verifyTotpCode(secret, twoStepsAgo, now).valid, false);
});

test("verifyTotpCode rejects a wrong code and non-numeric input", () => {
  const secret = generateTotpSecret();
  assert.equal(verifyTotpCode(secret, "000000", 1_700_000_000).valid, false);
  assert.equal(verifyTotpCode(secret, "abcdef", 1_700_000_000).valid, false);
  assert.equal(verifyTotpCode(secret, "12345", 1_700_000_000).valid, false);
});

test("totpAuthUri produces a valid otpauth:// URI with the expected parameters", () => {
  const uri = totpAuthUri("JBSWY3DPEHPK3PXP", "hinkok", "HinkoK OS");
  assert.match(uri, /^otpauth:\/\/totp\//);
  const parsed = new URL(uri);
  assert.equal(parsed.searchParams.get("secret"), "JBSWY3DPEHPK3PXP");
  assert.equal(parsed.searchParams.get("issuer"), "HinkoK OS");
  assert.equal(parsed.searchParams.get("digits"), "6");
  assert.equal(parsed.searchParams.get("period"), "30");
});
