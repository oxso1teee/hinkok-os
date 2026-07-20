import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import { serverEnv } from "@/lib/env/server";
import { readBoundedJsonBody } from "@/lib/http/json-body";
import { searchMemory } from "@/lib/memory/search";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;
const searchMemorySchema = z.object({
  query: z.string().trim().min(1).max(12_000),
  matchCount: z.int().min(1).max(100).default(20),
  minSimilarity: z.number().min(-1).max(1).default(0),
});

function jsonError(
  status: number,
  error: "unauthorized" | "invalid_request" | "rate_limited" | "unavailable",
): NextResponse {
  const response = NextResponse.json({ ok: false, error }, { status });
  response.headers.set("Cache-Control", "no-store");

  if (status === 429) {
    response.headers.set("Retry-After", "300");
  }

  return response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authentication = await authenticateRequest(request);

  if (!authentication.authenticated) {
    return jsonError(401, "unauthorized");
  }

  if (authentication.method === "session" && !hasSameOrigin(request)) {
    return jsonError(403, "invalid_request");
  }

  try {
    const untrustedBody = await readBoundedJsonBody(request, MAX_BODY_BYTES);

    if (!untrustedBody.ok) {
      return jsonError(400, "invalid_request");
    }

    const parsedBody = searchMemorySchema.safeParse(untrustedBody.value);

    if (!parsedBody.success) {
      return jsonError(400, "invalid_request");
    }

    const allowed = await consumeRateLimit({
      bucket: `memory:search:${serverEnv.USER_ID}`,
      windowSeconds: 300,
      maxRequests: 60,
    });

    if (!allowed) {
      return jsonError(429, "rate_limited");
    }

    const matches = await searchMemory(parsedBody.data);

    return NextResponse.json(
      { ok: true, matches },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    console.error("Memory search request failed", error);
    return jsonError(503, "unavailable");
  }
}
