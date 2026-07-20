import "server-only";

import { db } from "@/lib/supabase/admin";
import type {
  CaptureClassification,
  ClassifierSource,
} from "@/lib/capture/schema";

export type CaptureSource = "telegram" | "web" | "api";

type RouteCaptureInput = {
  userId: string;
  source: CaptureSource;
  text: string;
  classification: CaptureClassification;
  classifierSource: ClassifierSource;
  idempotencyKey: string;
  localDate: string;
  localTime: string;
};

export type RoutedCapture = {
  captureId: string;
  classification: CaptureClassification;
  classifierSource: ClassifierSource;
  routedTo: string;
  routedId: string | null;
  created: boolean;
  processingStatus: string;
  replySent: boolean;
};

export async function routeCapture(
  input: RouteCaptureInput,
): Promise<RoutedCapture> {
  const { data, error } = await db().rpc("route_capture", {
    p_user_id: input.userId,
    p_source: input.source,
    p_raw_text: input.text,
    p_classification: input.classification,
    p_llm_source: input.classifierSource,
    p_idempotency_key: input.idempotencyKey,
    p_local_date: input.localDate,
    p_local_time: input.localTime,
  });

  if (error) {
    throw new Error("Unable to route capture", { cause: error });
  }

  const result = data?.[0];

  if (!result) {
    throw new Error("Capture routing returned no result");
  }

  const classification = result.capture_classification as CaptureClassification;

  return {
    captureId: result.capture_id,
    classification,
    classifierSource: result.classifier_source as ClassifierSource,
    routedTo: result.route_name,
    routedId: result.route_id,
    created: result.was_created,
    processingStatus: result.processing_status,
    replySent: false,
  };
}
