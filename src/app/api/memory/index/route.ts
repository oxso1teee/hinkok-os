import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import { serverEnv } from "@/lib/env/server";
import { readBoundedJsonBody } from "@/lib/http/json-body";
import { indexMemory } from "@/lib/memory/indexing";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 700_000;
const indexMemorySchema = z.object({
  sourceType: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_-]*$/),
  sourceId: z.uuid().nullable().optional(),
  sourceKey: z.string().trim().min(1).max(512).optional(),
  text: z.string().trim().min(1).max(614_400),
  metadata: z.record(z.string(), z.json()).optional(),
});

function jsonError(
  status: number,
  error: "unauthorized" | "invalid_request" | "rate_limited" | "unavailable",
): NextResponse {
  const response = NextResponse.json({ ok: false, error }, { status });
  response.headers.set("Cache-Control", "no-store");

  if (status === 429) {
    response.headers.set("Retry-After", "900");
  }

  return response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authentication = authenticateRequest(request);

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

    const parsedBody = indexMemorySchema.safeParse(untrustedBody.value);

    if (!parsedBody.success) {
      return jsonError(400, "invalid_request");
    }

    const allowed = await consumeRateLimit({
      bucket: `memory:index:${serverEnv.USER_ID}`,
      windowSeconds: 900,
      maxRequests: 20,
    });

    if (!allowed) {
      return jsonError(429, "rate_limited");
    }

    const result = await indexMemory(parsedBody.data);

    return NextResponse.json(
      { ok: true, ...result },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    console.error("Memory indexing request failed", error);
    return jsonError(503, "unavailable");
  }
}
