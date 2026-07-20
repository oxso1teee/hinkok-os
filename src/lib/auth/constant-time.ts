import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export function constantTimeStringEqual(
  left: string,
  right: string,
): boolean {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();

  return timingSafeEqual(leftDigest, rightDigest);
}
