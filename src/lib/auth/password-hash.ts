import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_MAX_MEMORY = 32 * 1024 * 1024;

export type PasswordHash = {
  hash: string;
  salt: string;
  cost: number;
};

function deriveKey(password: string, salt: Buffer, cost: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: cost,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: Math.max(SCRYPT_MAX_MEMORY, 256 * cost * SCRYPT_BLOCK_SIZE),
      },
      (error, key) => {
        if (error) reject(error);
        else resolve(Buffer.from(key));
      },
    );
  });
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, SCRYPT_COST);

  return {
    hash: key.toString("base64"),
    salt: salt.toString("base64"),
    cost: SCRYPT_COST,
  };
}

export async function verifyPasswordHash(
  password: string,
  stored: PasswordHash,
): Promise<boolean> {
  const salt = Buffer.from(stored.salt, "base64");
  const expected = Buffer.from(stored.hash, "base64");
  const candidate = await deriveKey(password, salt, stored.cost);

  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}
