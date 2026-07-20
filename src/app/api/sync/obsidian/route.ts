import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import { serverEnv } from "@/lib/env/server";
import { readBoundedJsonBody } from "@/lib/http/json-body";
import { syncObsidianBatch } from "@/lib/obsidian/batch-sync";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_NOTE_CHARACTERS = 2 * 1024 * 1024;
const requestSchema = z
  .object({
    files: z
      .array(
        z.object({
          path: z.string().trim().min(1).max(1024),
          content: z.string().max(MAX_NOTE_CHARACTERS),
        }).strict(),
      )
      .max(50)
      .default([]),
    deletedPaths: z.array(z.string().trim().min(1).max(1024)).max(200).default([]),
  })
  .strict()
  .refine(
    (value) => value.files.length > 0 || value.deletedPaths.length > 0,
    "At least one changed or deleted note is required",
  );

function response(status: number, body: Record<string, unknown>): NextResponse {
  const result = NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

  if (status === 429) result.headers.set("Retry-After", "300");
  return result;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authentication = authenticateRequest(request);

  if (!authentication.authenticated) {
    return response(401, { ok: false, error: "unauthorized" });
  }

  if (authentication.method === "session" && !hasSameOrigin(request)) {
    return response(403, { ok: false, error: "invalid_request" });
  }

  const body = await readBoundedJsonBody(request, MAX_BODY_BYTES);
  const parsed = body.ok ? requestSchema.safeParse(body.value) : null;

  if (!parsed?.success) {
    return response(400, { ok: false, error: "invalid_request" });
  }

  const allowed = await consumeRateLimit({
    bucket: `obsidian:batch:${serverEnv.USER_ID}:${authentication.method}`,
    windowSeconds: 300,
    maxRequests: 12,
  });

  if (!allowed) {
    return response(429, { ok: false, error: "rate_limited" });
  }

  try {
    const result = await syncObsidianBatch(parsed.data);
    return response(200, { ok: true, ...result });
  } catch (error: unknown) {
    console.error("Direct Obsidian batch sync failed", error);
    return response(503, { ok: false, error: "unavailable" });
  }
}
