import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPasswordHash } from "../src/lib/auth/password-hash";

test("hashes a password and verifies the same password against it", async () => {
  const stored = await hashPassword("correct horse battery staple 2026");
  assert.equal(await verifyPasswordHash("correct horse battery staple 2026", stored), true);
});

test("rejects a wrong password against a stored hash", async () => {
  const stored = await hashPassword("correct horse battery staple 2026");
  assert.equal(await verifyPasswordHash("wrong password entirely", stored), false);
});

test("produces a different salt (and hash) for the same password across calls", async () => {
  const first = await hashPassword("same password");
  const second = await hashPassword("same password");
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(await verifyPasswordHash("same password", first), true);
  assert.equal(await verifyPasswordHash("same password", second), true);
});

test("rejects a tampered hash even with the correct password and salt", async () => {
  const stored = await hashPassword("correct horse battery staple 2026");
  const tampered = { ...stored, hash: Buffer.from("not the real key material derived from scrypt").toString("base64") };
  assert.equal(await verifyPasswordHash("correct horse battery staple 2026", tampered), false);
});
