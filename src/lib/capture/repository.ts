import "server-only";

import { serverEnv } from "@/lib/env/server";
import { db } from "@/lib/supabase/admin";
import type {
  CaptureClassification,
  ClassifierSource,
} from "@/lib/capture/schema";
import type { RoutedCapture } from "@/lib/capture/routing";

export async function findCaptureByIdempotencyKey(
  idempotencyKey: string,
): Promise<RoutedCapture | null> {
  const { data, error } = await db()
    .from("raw_captures")
    .select(
      "id, classification, llm_source, routed_to, routed_id, processing_status, source_reply_sent_at",
    )
    .eq("user_id", serverEnv.USER_ID)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to check capture idempotency", { cause: error });
  }

  if (!data || !data.llm_source || !data.routed_to) {
    return null;
  }

  return {
    captureId: data.id,
    classification: data.classification as CaptureClassification,
    classifierSource: data.llm_source as ClassifierSource,
    routedTo: data.routed_to,
    routedId: data.routed_id,
    created: false,
    processingStatus: data.processing_status,
    replySent: data.source_reply_sent_at !== null,
  };
}

export async function setCaptureProcessingStatus(
  captureId: string,
  status: "processed" | "degraded",
  errorCode: string | null,
): Promise<void> {
  const { error } = await db()
    .from("raw_captures")
    .update({
      processing_status: status,
      processing_error: errorCode,
      processed_at: new Date().toISOString(),
    })
    .eq("id", captureId)
    .eq("user_id", serverEnv.USER_ID);

  if (error) {
    throw new Error("Unable to update capture processing status", {
      cause: error,
    });
  }
}
