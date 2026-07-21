import { NextRequest, NextResponse } from "next/server";

import { recordAuditEvent } from "@/lib/audit";
import { hasValidCronAuthorization } from "@/lib/auth/cron";
import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import { encryptBackupSnapshot } from "@/lib/backups/crypto";
import { collectBackupSnapshot } from "@/lib/backups/repository";
import { backupRowCounts } from "@/lib/backups/schema";
import { backupEnv, isScheduledBackupConfigured } from "@/lib/env/backup";
import { serverEnv } from "@/lib/env/server";
import { isTelegramConfigured, telegramEnv } from "@/lib/env/telegram";
import { withObservedJob } from "@/lib/operations/jobs";
import type { SystemJobTrigger } from "@/lib/operations/normalize";
import { consumeRateLimit } from "@/lib/rate-limit";
import { sendTelegramDocument, sendTelegramMessage } from "@/lib/telegram/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_TELEGRAM_BACKUP_BYTES = 45 * 1024 * 1024;

async function deliverBackup(): Promise<{ totalRows: number; encryptedBytes: number }> {
  const snapshot = await collectBackupSnapshot();
  const envelope = await encryptBackupSnapshot(
    snapshot,
    backupEnv.SCHEDULED_BACKUP_PASSPHRASE as string,
  );
  const file = Buffer.from(JSON.stringify(envelope), "utf8");
  const counts = backupRowCounts(snapshot);
  const totalRows = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const timestamp = snapshot.exportedAt.replace(/[:.]/g, "-");

  if (isTelegramConfigured() && telegramEnv.TELEGRAM_USER_ID) {
    const chatId = Number(telegramEnv.TELEGRAM_USER_ID);
    if (file.byteLength <= MAX_TELEGRAM_BACKUP_BYTES) {
      await sendTelegramDocument(
        chatId,
        {
          bytes: file,
          fileName: `hinkok-os-${timestamp}.hinkok-backup`,
          mimeType: "application/vnd.hinkok.backup+json",
        },
        `Еженедельный бэкап готов: ${totalRows} строк. Расшифровывается паролем из SCHEDULED_BACKUP_PASSPHRASE через npm run backup:verify.`,
      );
    } else {
      await sendTelegramMessage(
        chatId,
        `Еженедельный бэкап готов (${totalRows} строк), но файл (${(file.byteLength / (1024 * 1024)).toFixed(1)} МБ) больше лимита Telegram для доставки ботом. Выполните npm run backup:create локально.`,
      );
    }
  }

  await recordAuditEvent({
    action: "backup.scheduled_exported",
    resourceType: "backup",
    metadata: {
      exportedAt: snapshot.exportedAt,
      totalRows,
      encryptedBytes: file.byteLength,
    },
  });

  return { totalRows, encryptedBytes: file.byteLength };
}

async function run(trigger: SystemJobTrigger): Promise<NextResponse> {
  if (!isScheduledBackupConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  if (
    trigger === "manual" &&
    !(await consumeRateLimit({
      bucket: `backup-scheduled:${serverEnv.USER_ID}`,
      windowSeconds: 3_600,
      maxRequests: 1,
    }))
  ) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  try {
    const observed = await withObservedJob({
      jobName: "backup_scheduled",
      trigger,
      execute: deliverBackup,
      summarize: (result) => result,
    });
    if (observed.skipped) return NextResponse.json({ ok: true, skipped: observed.reason });
    return NextResponse.json({ ok: true, ...observed.value });
  } catch (cause) {
    console.error("Scheduled backup failed", cause);
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!hasValidCronAuthorization(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return run("cron");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (auth.method === "session" && !hasSameOrigin(request)) {
    return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
  }
  return run("manual");
}
