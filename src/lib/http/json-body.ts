import "server-only";

import type { NextRequest } from "next/server";

type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; value: null };

export async function readBoundedJsonBody(
  request: NextRequest,
  maxBytes: number,
): Promise<JsonBodyResult> {
  const contentType = request.headers.get("content-type") ?? "";
  const rawContentLength = request.headers.get("content-length");
  const contentLength =
    rawContentLength === null ? null : Number(rawContentLength);

  if (
    !contentType.toLowerCase().startsWith("application/json") ||
    (contentLength !== null &&
      (!Number.isFinite(contentLength) ||
        contentLength < 0 ||
        contentLength > maxBytes))
  ) {
    return { ok: false, value: null };
  }

  const rawBody = await request.text();

  if (Buffer.byteLength(rawBody, "utf8") > maxBytes) {
    return { ok: false, value: null };
  }

  try {
    return { ok: true, value: JSON.parse(rawBody) as unknown };
  } catch {
    return { ok: false, value: null };
  }
}
