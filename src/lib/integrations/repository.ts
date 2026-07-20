import "server-only";

import { serverEnv } from "@/lib/env/server";
import { db } from "@/lib/supabase/admin";
import type { NutritionEstimate } from "@/lib/media/vision";
import type { TaskUrgency } from "@/lib/capture/schema";

export async function claimTelegramUpdate(
  updateId: number,
): Promise<number | null> {
  const { data, error } = await db().rpc("claim_telegram_update", {
    p_update_id: updateId,
    p_lease_seconds: 360,
  });

  if (error) {
    throw new Error("Unable to claim Telegram update", { cause: error });
  }

  return typeof data === "number" && data > 0 ? data : null;
}

export async function completeTelegramUpdate(
  updateId: number,
  attempt: number,
  ok: boolean,
): Promise<void> {
  const { data, error } = await db().rpc("complete_telegram_update", {
    p_update_id: updateId,
    p_attempt: attempt,
    p_ok: ok,
  });

  if (error || data !== true) {
    throw new Error("Unable to complete Telegram update", { cause: error });
  }
}

export async function markCaptureReplySent(captureId: string): Promise<void> {
  const { data, error } = await db().rpc("mark_capture_reply_sent", {
    p_user_id: serverEnv.USER_ID,
    p_capture_id: captureId,
  });

  if (error || data !== true) {
    throw new Error("Unable to mark capture reply as sent", { cause: error });
  }
}

export async function attachCaptureMedia(
  captureId: string,
  mediaType: "voice" | "photo",
  mediaFileId: string,
): Promise<void> {
  const { data, error } = await db().rpc("attach_capture_media", {
    p_user_id: serverEnv.USER_ID,
    p_capture_id: captureId,
    p_media_type: mediaType,
    p_media_file_id: mediaFileId,
  });

  if (error || data !== true) {
    throw new Error("Unable to attach capture media", { cause: error });
  }
}

export async function applyMealNutrition(
  captureId: string,
  nutrition: NutritionEstimate,
): Promise<void> {
  const { data, error } = await db().rpc("apply_meal_nutrition", {
    p_user_id: serverEnv.USER_ID,
    p_capture_id: captureId,
    p_kcal: nutrition.kcal,
    p_protein: nutrition.protein,
    p_carbs: nutrition.carbs,
    p_fat: nutrition.fat,
  });

  if (error || data !== true) {
    throw new Error("Unable to apply meal nutrition", { cause: error });
  }
}

export async function completeCalendarRoute(
  captureId: string,
  externalRef: string,
): Promise<void> {
  const { data, error } = await db().rpc("complete_calendar_route", {
    p_user_id: serverEnv.USER_ID,
    p_capture_id: captureId,
    p_external_ref: externalRef,
  });

  if (error || data !== true) {
    throw new Error("Unable to complete calendar route", { cause: error });
  }
}

export async function setTaskUrgency(
  taskId: string,
  urgency: TaskUrgency,
): Promise<boolean> {
  const { data, error } = await db().rpc("set_task_urgency", {
    p_user_id: serverEnv.USER_ID,
    p_task_id: taskId,
    p_urgency: urgency,
  });

  if (error) {
    throw new Error("Unable to update task urgency", { cause: error });
  }

  return data === true;
}
