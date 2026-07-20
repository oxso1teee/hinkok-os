import "server-only";

import type { NextRequest } from "next/server";

export function hasSameOrigin(request: NextRequest): boolean {
  const originHeader = request.headers.get("origin");

  if (!originHeader) {
    return false;
  }

  try {
    return new URL(originHeader).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}
