import type { ProcessCaptureResult } from "@/lib/capture/pipeline";
import type { NutritionEstimate } from "@/lib/media/vision";
import { URGENCY_LABELS } from "@/lib/telegram/callback";

export function captureReplyText(
  result: ProcessCaptureResult,
  nutrition?: NutritionEstimate,
): string {
  const title = result.classification.title;

  switch (result.classification.kind) {
    case "task":
      return `Задача сохранена: ${title}\nСрок: ${URGENCY_LABELS[result.classification.urgency]}`;
    case "event":
      return result.externalSynced
        ? `Событие добавлено в календарь: ${title}`
        : `Событие сохранено и ожидает синхронизации календаря: ${title}`;
    case "meal":
      return nutrition
        ? `Приём пищи сохранён: ${title}\n≈ ${nutrition.kcal} ккал · Б ${nutrition.protein} · Ж ${nutrition.fat} · У ${nutrition.carbs}`
        : `Приём пищи сохранён: ${title}`;
    case "journal":
      return `Запись добавлена в дневник: ${title}`;
    case "idea":
      return `Идея сохранена: ${title}`;
    case "decision":
      return `Решение сохранено: ${title}`;
    default:
      return `Запись сохранена: ${title}`;
  }
}
