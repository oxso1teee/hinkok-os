import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import {
  taskUrgencySchema,
  type CaptureKind,
} from "@/lib/capture/schema";
import {
  processCapture,
  type ProcessCaptureResult,
} from "@/lib/capture/pipeline";
import { findCaptureByIdempotencyKey } from "@/lib/capture/repository";
import { telegramEnv } from "@/lib/env/telegram";
import {
  markCaptureReplySent,
  setTaskUrgency,
} from "@/lib/integrations/repository";
import { transcribeAudio } from "@/lib/media/transcription";
import { analyzeImage, type NutritionEstimate } from "@/lib/media/vision";
import {
  parseTaskUrgencyCallback,
  parseHelpCallback,
  telegramMainMenuKeyboard,
  taskUrgencyKeyboard,
  URGENCY_LABELS,
} from "@/lib/telegram/callback";
import {
  answerTelegramCallback,
  downloadTelegramFile,
  sendTelegramMessage,
} from "@/lib/telegram/client";
import { captureReplyText } from "@/lib/telegram/reply";
import type {
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramUpdate,
} from "@/lib/telegram/schema";

const MAX_VISION_BYTES = 5 * 1024 * 1024;

const START_TEXT = `HinkoK OS подключён.

Отправляйте обычный текст — система сама определит его тип.

Для точного маршрута используйте команды:
/task текст — задача в CRM
/journal текст — запись в дневник
/meal текст — питание
/event текст с датой и временем — событие
/note текст — заметка

Голосовые сообщения распознаются, фотографии еды анализируются автоматически.`;

const HELP_TEXT: Record<string, string> = {
  task: "Задача: отправьте `/task Нужно сегодня составить план английского`.",
  journal: "Дневник: отправьте `/journal Сегодня было спокойное продуктивное утро`.",
  meal: "Питание: отправьте `/meal Овсянка с бананом` или пришлите фотографию блюда.",
  event: "Событие: отправьте `/event Завтра в 15:00 созвон по проекту`.",
  voice: "Пришлите голосовое — текст будет распознан и классифицирован. Фото блюда попадёт в питание с примерной оценкой КБЖУ.",
};

type CaptureCommand = {
  text: string;
  kind: CaptureKind;
};

function commandCapture(text: string): CaptureCommand | "empty" | null {
  const match = text.match(/^\/(task|journal|meal|event|note|idea)(?:@\w+)?(?:\s+([\s\S]+))?$/iu);

  if (!match) return null;
  const content = match[2]?.trim();
  if (!content) return "empty";

  const kindByCommand: Record<string, CaptureKind> = {
    task: "task",
    journal: "journal",
    meal: "meal",
    event: "event",
    note: "note",
    idea: "idea",
  };

  return {
    text: content,
    kind: kindByCommand[match[1].toLowerCase()],
  };
}

function ownerId(): string {
  if (!telegramEnv.TELEGRAM_USER_ID) {
    throw new Error("Telegram is not configured");
  }

  return telegramEnv.TELEGRAM_USER_ID;
}

function isOwnedPrivateMessage(message: TelegramMessage): boolean {
  return (
    message.chat.type === "private" &&
    String(message.chat.id) === ownerId() &&
    Boolean(message.from) &&
    String(message.from?.id) === ownerId() &&
    message.from?.is_bot === false
  );
}

async function handleCallback(query: TelegramCallbackQuery): Promise<void> {
  if (
    String(query.from.id) !== ownerId() ||
    query.from.is_bot ||
    !query.message ||
    !isOwnedPrivateMessage(query.message)
  ) {
    return;
  }

  const helpTopic = parseHelpCallback(query.data);

  if (helpTopic) {
    await answerTelegramCallback(query.id, "Инструкция отправлена");
    await sendTelegramMessage(
      query.message.chat.id,
      HELP_TEXT[helpTopic],
      telegramMainMenuKeyboard(),
    );
    return;
  }

  const callback = parseTaskUrgencyCallback(query.data);

  if (!callback) {
    await answerTelegramCallback(query.id, "Команда устарела");
    return;
  }

  const urgency = taskUrgencySchema.parse(callback.urgency);
  const updated = await setTaskUrgency(callback.taskId, urgency);

  if (updated) {
    await recordAuditEvent({
      action: "task.urgency.updated",
      resourceType: "task",
      resourceId: callback.taskId,
      metadata: { urgency, source: "telegram" },
    });
  }

  await answerTelegramCallback(
    query.id,
    updated ? `Срок: ${URGENCY_LABELS[urgency]}` : "Задача не найдена",
  );
}

function selectLargestPhoto(message: TelegramMessage) {
  const photos = message.photo ?? [];
  const withinKnownLimit = photos.filter(
    (photo) => !photo.file_size || photo.file_size <= MAX_VISION_BYTES,
  );
  const candidates = withinKnownLimit.length > 0 ? withinKnownLimit : photos;

  return [...candidates].sort(
    (left, right) => right.width * right.height - left.width * left.height,
  )[0];
}

async function messageCaptureInput(message: TelegramMessage): Promise<{
  text: string;
  media?: { type: "voice" | "photo"; fileId: string };
  nutrition?: NutritionEstimate;
}> {
  const text = message.text?.trim();

  if (text) {
    return { text };
  }

  if (message.voice) {
    const file = await downloadTelegramFile(message.voice.file_id);
    let transcript: string;

    try {
      transcript = await transcribeAudio(
        file.bytes,
        file.fileName.endsWith(".oga") ? "voice.ogg" : file.fileName,
        message.voice.mime_type ?? file.mimeType,
      );
    } catch (error: unknown) {
      console.error("Telegram voice transcription failed", error);
      throw new Error("Voice transcription unavailable", { cause: error });
    }

    return {
      text: transcript,
      media: { type: "voice", fileId: message.voice.file_id },
    };
  }

  const photo = selectLargestPhoto(message);

  if (photo) {
    const file = await downloadTelegramFile(photo.file_id);

    if (file.bytes.byteLength > MAX_VISION_BYTES) {
      throw new Error("Telegram photo exceeds the vision size limit");
    }

    const analysis = await analyzeImage(file.bytes, file.mimeType);
    const caption = message.caption?.trim();
    const mealLine = analysis.containsFood
      ? `Приём пищи: ${analysis.mealName ?? "еда на фотографии"}.`
      : "Фотография для личной заметки.";
    const nutritionLine = analysis.nutrition
      ? `Оценка: ${analysis.nutrition.kcal} ккал, белки ${analysis.nutrition.protein} г, жиры ${analysis.nutrition.fat} г, углеводы ${analysis.nutrition.carbs} г.`
      : null;

    return {
      text: [caption, mealLine, analysis.description, nutritionLine]
        .filter(Boolean)
        .join("\n"),
      media: { type: "photo", fileId: photo.file_id },
      nutrition: analysis.nutrition ?? undefined,
    };
  }

  throw new Error("Unsupported Telegram message type");
}

async function handleMessage(message: TelegramMessage): Promise<void> {
  if (!isOwnedPrivateMessage(message)) {
    return;
  }

  const messageText = message.text?.trim();

  if (messageText && /^\/(?:start|help|menu)(?:@\w+)?$/iu.test(messageText)) {
    await sendTelegramMessage(
      message.chat.id,
      START_TEXT,
      telegramMainMenuKeyboard(),
    );
    return;
  }

  let forcedKind: CaptureKind | undefined;

  if (messageText?.startsWith("/")) {
    const parsedCommand = commandCapture(messageText);

    if (parsedCommand === "empty") {
      await sendTelegramMessage(
        message.chat.id,
        "После команды добавьте текст. Пример: /task Купить билеты сегодня",
        telegramMainMenuKeyboard(),
      );
      return;
    }

    if (parsedCommand === null) {
      await sendTelegramMessage(
        message.chat.id,
        "Неизвестная команда. Нажмите /menu, чтобы увидеть возможности.",
        telegramMainMenuKeyboard(),
      );
      return;
    }

    forcedKind = parsedCommand.kind;
    message = { ...message, text: parsedCommand.text };
  }

  const idempotencyKey = `tg:${message.chat.id}:${message.message_id}`;
  const existing = await findCaptureByIdempotencyKey(idempotencyKey);

  if (existing) {
    if (existing.replySent) {
      return;
    }

    const replayResult: ProcessCaptureResult = {
      ...existing,
      memoryIndexed: existing.processingStatus === "processed",
      externalSynced: existing.routedTo === "google_calendar",
    };
    const replayKeyboard =
      replayResult.classification.kind === "task" && replayResult.routedId
        ? taskUrgencyKeyboard(replayResult.routedId)
        : undefined;

    await sendTelegramMessage(
      message.chat.id,
      captureReplyText(replayResult),
      replayKeyboard,
    );
    await markCaptureReplySent(replayResult.captureId);
    return;
  }

  let input: Awaited<ReturnType<typeof messageCaptureInput>>;

  try {
    input = await messageCaptureInput(message);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === "Unsupported Telegram message type"
    ) {
      await sendTelegramMessage(
        message.chat.id,
        "Отправьте текст, голосовое сообщение или фотографию.",
      );
      return;
    }

    if (
      error instanceof Error &&
      error.message === "Voice transcription unavailable"
    ) {
      await sendTelegramMessage(
        message.chat.id,
        "Не удалось надёжно распознать голосовое сообщение. Отправьте его ещё раз или напишите текстом.",
      );
      return;
    }

    throw error;
  }

  const result = await processCapture({
    text: input.text,
    source: "telegram",
    idempotencyKey,
    forcedKind,
    capturedAt: new Date(message.date * 1000),
    media: input.media,
    nutrition: input.nutrition,
  });

  if (!result.created) {
    return;
  }

  const keyboard =
    result.classification.kind === "task" && result.routedId
      ? taskUrgencyKeyboard(result.routedId)
      : undefined;

  await sendTelegramMessage(
    message.chat.id,
    captureReplyText(result, input.nutrition),
    keyboard,
  );
  await markCaptureReplySent(result.captureId);
}

export async function handleTelegramUpdate(
  update: TelegramUpdate,
): Promise<void> {
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }

  if (update.message) {
    await handleMessage(update.message);
  }
}
