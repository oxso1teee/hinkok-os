import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptBackupEnvelope,
  encryptBackupSnapshot,
  validateBackupPassphrase,
} from "../src/lib/backups/crypto";
import {
  SNAPSHOT_FORMAT,
  SNAPSHOT_FORMAT_VERSION,
  SNAPSHOT_SCHEMA_MIGRATION,
  emptyBackupTables,
  parseEncryptedBackupEnvelope,
  validateBackupSnapshot,
  type BackupSnapshot,
  type EncryptedBackupEnvelope,
} from "../src/lib/backups/schema";

const PASSPHRASE = "correct horse battery staple 2026";

function snapshot(): BackupSnapshot {
  const tables = emptyBackupTables();
  tables.entities.push({
    id: "92d0fcbd-3b96-47cd-ae0f-f6770a548b62",
    user_id: "hinkok",
    name: "Private project",
    kind: "project",
    metadata: {},
    created_at: "2026-07-18T16:00:00.000Z",
  });
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_FORMAT_VERSION,
    schemaMigration: SNAPSHOT_SCHEMA_MIGRATION,
    exportedAt: "2026-07-18T16:30:00.000Z",
    userId: "hinkok",
    tables,
  };
}

test("encrypts and authenticates a complete portable snapshot", async () => {
  const source = snapshot();
  const encrypted = await encryptBackupSnapshot(source, PASSPHRASE);
  assert.equal(encrypted.cipher, "aes-256-gcm");
  assert.equal(encrypted.kdf.name, "scrypt");
  assert.notEqual(encrypted.ciphertext.includes("Private project"), true);
  const decrypted = await decryptBackupEnvelope(encrypted, PASSPHRASE);
  assert.deepEqual(decrypted, source);
});

test("rejects the wrong passphrase before returning snapshot data", async () => {
  const encrypted = await encryptBackupSnapshot(snapshot(), PASSPHRASE);
  await assert.rejects(
    decryptBackupEnvelope(encrypted, "wrong passphrase long enough 2026"),
    /Unable to decrypt or authenticate/,
  );
});

test("detects authenticated ciphertext tampering", async () => {
  const encrypted = await encryptBackupSnapshot(snapshot(), PASSPHRASE);
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64");
  ciphertext[0] ^= 1;
  const tampered: EncryptedBackupEnvelope = {
    ...encrypted,
    ciphertext: ciphertext.toString("base64"),
  };
  await assert.rejects(
    decryptBackupEnvelope(tampered, PASSPHRASE),
    /Unable to decrypt or authenticate/,
  );
});

test("rejects incomplete table sets and cross-user rows", () => {
  const missing = snapshot() as unknown as Record<string, unknown>;
  missing.tables = {};
  assert.throws(() => validateBackupSnapshot(missing), /table set/);

  const wrongUser = snapshot();
  wrongUser.tables.entities[0].user_id = "someone-else";
  assert.throws(() => validateBackupSnapshot(wrongUser), /user scope mismatch/);
});

test("bounds passphrases and untrusted KDF parameters", async () => {
  assert.throws(() => validateBackupPassphrase("too-short"), /16 to 1024/);
  const encrypted = await encryptBackupSnapshot(snapshot(), PASSPHRASE);
  assert.ok(parseEncryptedBackupEnvelope(encrypted));
  const expensive = structuredClone(encrypted) as unknown as Record<string, unknown>;
  expensive.kdf = {
    ...encrypted.kdf,
    cost: 131_072,
  };
  assert.equal(parseEncryptedBackupEnvelope(expensive), null);
});
