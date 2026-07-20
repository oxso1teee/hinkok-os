import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import { classifyCapture } from "@/lib/capture/classifier";
import { listKnownEntities } from "@/lib/capture/entities";
import type { CaptureKind } from "@/lib/capture/schema";
import {
  findCaptureByIdempotencyKey,
  setCaptureProcessingStatus,
} from "@/lib/capture/repository";
import {
  routeCapture,
  type CaptureSource,
} from "@/lib/capture/routing";
import { localCaptureTime } from "@/lib/capture/time";
import { serverEnv } from "@/lib/env/server";
import { syncCaptureToGoogleCalendar } from "@/lib/integrations/google-calendar";
import {
  applyMealNutrition,
  attachCaptureMedia,
} from "@/lib/integrations/repository";
import type { NutritionEstimate } from "@/lib/media/vision";
import { indexMemory } from "@/lib/memory/indexing";

type ProcessCaptureInput = {
  text: string;
  source: CaptureSource;
  idempotencyKey: string;
  forcedKind?: CaptureKind;
  capturedAt?: Date;
  media?: {
    type: "voice" | "photo";
    fileId: string;
  };
  nutrition?: NutritionEstimate;
};

export type ProcessCaptureResult = {
  captureId: string;
  classification: Awaited<ReturnType<typeof classifyCapture>>["classification"];
  classifierSource: Awaited<ReturnType<typeof classifyCapture>>["source"];
  routedTo: string;
  routedId: string | null;
  created: boolean;
  memoryIndexed: boolean;
  externalSynced: boolean;
  processingStatus: string;
  replySent: boolean;
};

function memoryText(
  title: string,
  summary: string,
  rawText: string,
): string {
  return [`Title: ${title}`, `Summary: ${summary}`, "", rawText].join("\n");
}

export async function processCapture(
  input: ProcessCaptureInput,
): Promise<ProcessCaptureResult> {
  const existing = await findCaptureByIdempotencyKey(input.idempotencyKey);

  if (existing) {
    return {
      ...existing,
      memoryIndexed: existing.processingStatus === "processed",
      externalSynced: existing.routedTo === "google_calendar",
    };
  }

  const capturedAt = input.capturedAt ?? new Date();
  const localTime = localCaptureTime(capturedAt, serverEnv.USER_TIMEZONE);
  const knownEntities = await listKnownEntities();
  const classified = await classifyCapture({
    text: input.text,
    currentTime: localTime.isoWithOffset,
    timeZone: serverEnv.USER_TIMEZONE,
    knownEntities,
  });
  const classification = input.forcedKind
    ? {
        ...classified.classification,
        kind: input.forcedKind,
        urgency:
          input.forcedKind === "task"
            ? classified.classification.urgency
            : "someday" as const,
        sphere:
          input.forcedKind === "meal"
            ? "health" as const
            : classified.classification.sphere,
        tags: Array.from(
          new Set([
            input.forcedKind,
            ...classified.classification.tags.filter(
              (tag) => tag !== classified.classification.kind,
            ),
          ]),
        ).slice(0, 4),
      }
    : classified.classification;
  const routed = await routeCapture({
    userId: serverEnv.USER_ID,
    source: input.source,
    text: input.text,
    classification,
    classifierSource: classified.source,
    idempotencyKey: input.idempotencyKey,
    localDate: localTime.date,
    localTime: localTime.time,
  });

  if (!routed.created) {
    return {
      ...routed,
      memoryIndexed: routed.processingStatus === "processed",
      externalSynced: routed.routedTo === "google_calendar",
    };
  }

  let integrationSucceeded = true;
  let externalSynced = false;

  if (input.media) {
    try {
      await attachCaptureMedia(
        routed.captureId,
        input.media.type,
        input.media.fileId,
      );
    } catch (error: unknown) {
      integrationSucceeded = false;
      console.error("Capture media attachment failed", error);
    }
  }

  if (
    input.nutrition &&
    classification.kind === "meal"
  ) {
    try {
      await applyMealNutrition(routed.captureId, input.nutrition);
    } catch (error: unknown) {
      integrationSucceeded = false;
      console.error("Meal nutrition update failed", error);
    }
  }

  try {
    const calendarResult = await syncCaptureToGoogleCalendar(
      routed.captureId,
      classification,
    );
    externalSynced = calendarResult.status === "synced";
  } catch (error: unknown) {
    integrationSucceeded = false;
    console.error("Calendar capture routing failed", error);
  }

  const effectiveRoutedTo = externalSynced
    ? "google_calendar"
    : routed.routedTo;
  let memoryIndexed = false;
  let auditRecorded = false;

  try {
    await indexMemory({
      sourceType: "capture",
      sourceId: routed.captureId,
      sourceKey: routed.captureId,
      text: memoryText(
        classification.title,
        classification.summary,
        input.text,
      ),
      metadata: {
        kind: classification.kind,
        sphere: classification.sphere,
        routedTo: effectiveRoutedTo,
        routedId: routed.routedId,
        mediaType: input.media?.type ?? "text",
        externalSynced,
        nutritionEstimated: Boolean(input.nutrition),
        nutritionConfidence: input.nutrition?.confidenceScore ?? null,
      },
    });
    memoryIndexed = true;
  } catch (error: unknown) {
    console.error("Capture memory indexing failed", error);
  }

  try {
    await recordAuditEvent({
      action: "capture.processed",
      resourceType: "raw_capture",
      resourceId: routed.captureId,
      metadata: {
        source: input.source,
        classifierSource: classified.source,
        classifierFallbacks: classified.fallbacksUsed,
        kind: classification.kind,
        routedTo: effectiveRoutedTo,
        routedId: routed.routedId,
        memoryIndexed,
        externalSynced,
        integrationSucceeded,
      },
    });
    auditRecorded = true;
  } catch (error: unknown) {
    console.error("Capture audit recording failed", error);
  }

  const processingStatus =
    memoryIndexed && auditRecorded && integrationSucceeded
      ? "processed"
      : "degraded";
  const errorCode = !integrationSucceeded
    ? "integration_failed"
    : !memoryIndexed
      ? "memory_index_failed"
      : !auditRecorded
        ? "audit_failed"
        : null;

  await setCaptureProcessingStatus(
    routed.captureId,
    processingStatus,
    errorCode,
  );

  return {
    ...routed,
    routedTo: effectiveRoutedTo,
    memoryIndexed,
    externalSynced,
    processingStatus,
  };
}
