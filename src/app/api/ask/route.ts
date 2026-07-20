import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import { serverEnv } from "@/lib/env/server";
import { readBoundedJsonBody } from "@/lib/http/json-body";
import { answerMemoryQuestion } from "@/lib/rag/answer";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BODY_BYTES = 16_384;
const askSchema = z
  .object({
    query: z.string().trim().min(1).max(4_000),
    matchCount: z.int().min(1).max(20).default(12),
    minSimilarity: z.number().min(-1).max(1).default(0.2),
  })
  .strict();

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
    const body = await readBoundedJsonBody(request, MAX_BODY_BYTES);

    if (!body.ok) {
      return jsonError(400, "invalid_request");
    }

    const parsed = askSchema.safeParse(body.value);

    if (!parsed.success) {
      return jsonError(400, "invalid_request");
    }

    const allowed = await consumeRateLimit({
      bucket: `rag:ask:${serverEnv.USER_ID}:${authentication.method}`,
      windowSeconds: 300,
      maxRequests: 30,
    });

    if (!allowed) {
      return jsonError(429, "rate_limited");
    }

    const result = await answerMemoryQuestion(parsed.data);

    return NextResponse.json(
      { ok: true, ...result },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: unknown) {
    console.error("RAG answer request failed", error);
    return jsonError(503, "unavailable");
  }
}
