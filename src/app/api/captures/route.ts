import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import { processCapture } from "@/lib/capture/pipeline";
import { serverEnv } from "@/lib/env/server";
import { readBoundedJsonBody } from "@/lib/http/json-body";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 65_536;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const captureRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(50_000),
  })
  .strict();

function jsonError(
  status: number,
  error: "unauthorized" | "invalid_request" | "rate_limited" | "unavailable",
): NextResponse {
  const response = NextResponse.json({ ok: false, error }, { status });
  response.headers.set("Cache-Control", "no-store");

  if (status === 429) {
    response.headers.set("Retry-After", "600");
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

  const suppliedIdempotencyKey = request.headers
    .get("idempotency-key")
    ?.trim();

  if (
    suppliedIdempotencyKey &&
    !IDEMPOTENCY_KEY_PATTERN.test(suppliedIdempotencyKey)
  ) {
    return jsonError(400, "invalid_request");
  }

  try {
    const untrustedBody = await readBoundedJsonBody(request, MAX_BODY_BYTES);

    if (!untrustedBody.ok) {
      return jsonError(400, "invalid_request");
    }

    const parsedBody = captureRequestSchema.safeParse(untrustedBody.value);

    if (!parsedBody.success) {
      return jsonError(400, "invalid_request");
    }

    const allowed = await consumeRateLimit({
      bucket: `capture:${serverEnv.USER_ID}:${authentication.method}`,
      windowSeconds: 600,
      maxRequests: 60,
    });

    if (!allowed) {
      return jsonError(429, "rate_limited");
    }

    const idempotencyKey = suppliedIdempotencyKey ?? randomUUID();
    const source = authentication.method === "session" ? "web" : "api";
    const result = await processCapture({
      text: parsedBody.data.text,
      source,
      idempotencyKey,
    });

    return NextResponse.json(
      {
        ok: true,
        idempotencyKey,
        ...result,
      },
      {
        status: result.created ? 201 : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error: unknown) {
    console.error("Capture request failed", error);
    return jsonError(503, "unavailable");
  }
}
