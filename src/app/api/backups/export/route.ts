import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditEvent } from "@/lib/audit";
import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import { encryptBackupSnapshot } from "@/lib/backups/crypto";
import { collectBackupSnapshot } from "@/lib/backups/repository";
import { backupRowCounts } from "@/lib/backups/schema";
import { serverEnv } from "@/lib/env/server";
import { readBoundedJsonBody } from "@/lib/http/json-body";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BODY_BYTES = 4_096;
const MAX_WEB_BACKUP_PLAINTEXT_BYTES = 3 * 1024 * 1024;
const requestSchema = z
  .object({
    passphrase: z.string().min(16).max(1_024),
    confirmation: z.string().min(16).max(1_024),
  })
  .strict()
  .refine((value) => value.passphrase === value.confirmation);

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): NextResponse {
  const response = NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
  if (status === 429) response.headers.set("Retry-After", "3600");
  return response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authentication = authenticateRequest(request);
  if (!authentication.authenticated) {
    return jsonResponse(401, { ok: false, error: "unauthorized" });
  }
  if (authentication.method === "session" && !hasSameOrigin(request)) {
    return jsonResponse(403, { ok: false, error: "invalid_request" });
  }

  try {
    const body = await readBoundedJsonBody(request, MAX_BODY_BYTES);
    if (!body.ok) return jsonResponse(400, { ok: false, error: "invalid_request" });
    const parsed = requestSchema.safeParse(body.value);
    if (!parsed.success) {
      return jsonResponse(400, { ok: false, error: "invalid_passphrase" });
    }

    const allowed = await consumeRateLimit({
      bucket: `backup:export:${serverEnv.USER_ID}:${authentication.method}`,
      windowSeconds: 3_600,
      maxRequests: 2,
    });
    if (!allowed) return jsonResponse(429, { ok: false, error: "rate_limited" });

    const snapshot = await collectBackupSnapshot();
    if (
      Buffer.byteLength(JSON.stringify(snapshot), "utf8") >
      MAX_WEB_BACKUP_PLAINTEXT_BYTES
    ) {
      return jsonResponse(413, { ok: false, error: "use_local_cli" });
    }
    const envelope = await encryptBackupSnapshot(
      snapshot,
      parsed.data.passphrase,
    );
    const file = JSON.stringify(envelope);
    const counts = backupRowCounts(snapshot);
    const totalRows = Object.values(counts).reduce((sum, count) => sum + count, 0);
    await recordAuditEvent({
      action: "backup.exported",
      resourceType: "backup",
      metadata: {
        exportedAt: snapshot.exportedAt,
        totalRows,
        encryptedBytes: Buffer.byteLength(file, "utf8"),
      },
    });
    const timestamp = snapshot.exportedAt.replace(/[:.]/g, "-");
    return new NextResponse(file, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="hinkok-os-${timestamp}.hinkok-backup"`,
        "Content-Type": "application/vnd.hinkok.backup+json",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    console.error("Encrypted backup export failed", error);
    const oversized = error instanceof Error && (
      error.message === "Backup row limit exceeded" ||
      error.message === "Backup plaintext exceeds the size limit"
    );
    return jsonResponse(oversized ? 413 : 503, {
      ok: false,
      error: oversized ? "backup_too_large" : "unavailable",
    });
  }
}
