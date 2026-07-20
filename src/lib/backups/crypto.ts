import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as nodeScrypt,
} from "node:crypto";

import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  MAX_BACKUP_PLAINTEXT_BYTES,
  parseEncryptedBackupEnvelope,
  validateBackupSnapshot,
  type BackupSnapshot,
  type EncryptedBackupEnvelope,
} from "@/lib/backups/schema";

const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

function snapshotSha256(plaintext: Buffer | string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function validateBackupPassphrase(passphrase: string): void {
  if (
    typeof passphrase !== "string" ||
    passphrase.length < 16 ||
    passphrase.length > 1_024 ||
    Buffer.byteLength(passphrase, "utf8") > 4_096
  ) {
    throw new Error("Backup passphrase must contain 16 to 1024 characters");
  }
}

async function deriveKey(
  passphrase: string,
  salt: Buffer,
  cost: number,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(passphrase, salt, SCRYPT_KEY_LENGTH, {
      N: cost,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
      maxmem: Math.max(SCRYPT_MAX_MEMORY, 256 * cost * SCRYPT_BLOCK_SIZE),
    }, (error, key) => {
      if (error) reject(error);
      else resolve(Buffer.from(key));
    });
  });
}

function authenticatedHeader(options: {
  salt: string;
  cost: number;
  iv: string;
  plaintextSha256: string;
}): Buffer {
  return Buffer.from(
    JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_FORMAT_VERSION,
      cipher: "aes-256-gcm",
      kdf: {
        name: "scrypt",
        salt: options.salt,
        cost: options.cost,
        blockSize: SCRYPT_BLOCK_SIZE,
        parallelization: SCRYPT_PARALLELIZATION,
        keyLength: SCRYPT_KEY_LENGTH,
      },
      iv: options.iv,
      plaintextSha256: options.plaintextSha256,
    }),
    "utf8",
  );
}

export async function encryptBackupSnapshot(
  snapshot: BackupSnapshot,
  passphrase: string,
): Promise<EncryptedBackupEnvelope> {
  validateBackupPassphrase(passphrase);
  const verified = validateBackupSnapshot(snapshot);
  const plaintext = Buffer.from(JSON.stringify(verified), "utf8");
  if (plaintext.length > MAX_BACKUP_PLAINTEXT_BYTES) {
    throw new Error("Backup plaintext exceeds the size limit");
  }

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const saltBase64 = salt.toString("base64");
  const ivBase64 = iv.toString("base64");
  const plaintextSha256 = snapshotSha256(plaintext);
  const key = await deriveKey(passphrase, salt, SCRYPT_COST);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(authenticatedHeader({
    salt: saltBase64,
    cost: SCRYPT_COST,
    iv: ivBase64,
    plaintextSha256,
  }));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_FORMAT_VERSION,
    cipher: "aes-256-gcm",
    kdf: {
      name: "scrypt",
      salt: saltBase64,
      cost: SCRYPT_COST,
      blockSize: SCRYPT_BLOCK_SIZE,
      parallelization: SCRYPT_PARALLELIZATION,
      keyLength: SCRYPT_KEY_LENGTH,
    },
    iv: ivBase64,
    authTag: cipher.getAuthTag().toString("base64"),
    plaintextSha256,
    ciphertext: ciphertext.toString("base64"),
  };
}

export async function decryptBackupEnvelope(
  value: unknown,
  passphrase: string,
): Promise<BackupSnapshot> {
  validateBackupPassphrase(passphrase);
  const envelope = parseEncryptedBackupEnvelope(value);
  if (!envelope) throw new Error("Invalid encrypted backup envelope");
  const salt = Buffer.from(envelope.kdf.salt, "base64");
  const iv = Buffer.from(envelope.iv, "base64");
  const key = await deriveKey(passphrase, salt, envelope.kdf.cost);

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(authenticatedHeader({
      salt: envelope.kdf.salt,
      cost: envelope.kdf.cost,
      iv: envelope.iv,
      plaintextSha256: envelope.plaintextSha256,
    }));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    if (plaintext.length > MAX_BACKUP_PLAINTEXT_BYTES) {
      throw new Error("Backup plaintext exceeds the size limit");
    }
    if (snapshotSha256(plaintext) !== envelope.plaintextSha256) {
      throw new Error("Backup checksum mismatch");
    }
    return validateBackupSnapshot(JSON.parse(plaintext.toString("utf8")) as unknown);
  } catch (error: unknown) {
    if (error instanceof Error && (
      error.message === "Backup plaintext exceeds the size limit" ||
      error.message === "Backup checksum mismatch"
    )) {
      throw error;
    }
    throw new Error("Unable to decrypt or authenticate the backup");
  }
}
