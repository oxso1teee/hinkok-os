import "server-only";

import { z } from "zod";

import { telegramEnv } from "@/lib/env/telegram";

const MAX_TELEGRAM_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TELEGRAM_UPLOAD_BYTES = 45 * 1024 * 1024;
const telegramResponseSchema = z.object({
  ok: z.boolean(),
  result: z.unknown().optional(),
  description: z.string().optional(),
});
const telegramFileSchema = z.object({
  file_id: z.string(),
  file_unique_id: z.string(),
  file_size: z.number().int().nonnegative().optional(),
  file_path: z.string().min(1).max(1024),
});

export type TelegramDownloadedFile = {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
};

function inferMimeType(fileName: string): string {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lowerName.endsWith(".png")) {
    return "image/png";
  }

  if (lowerName.endsWith(".webp")) {
    return "image/webp";
  }

  if (lowerName.endsWith(".oga") || lowerName.endsWith(".ogg")) {
    return "audio/ogg";
  }

  return "application/octet-stream";
}

function botToken(): string {
  if (!telegramEnv.TELEGRAM_BOT_TOKEN) {
    throw new Error("Telegram is not configured");
  }

  return telegramEnv.TELEGRAM_BOT_TOKEN;
}

async function telegramRequest<T>(
  method: string,
  payload: Record<string, unknown> | FormData,
  resultSchema: z.ZodType<T>,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(
      `https://api.telegram.org/bot${botToken()}/${method}`,
      payload instanceof FormData
        ? {
            method: "POST",
            body: payload,
            signal: AbortSignal.timeout(60_000),
            cache: "no-store",
          }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(20_000),
            cache: "no-store",
          },
    );
  } catch {
    throw new Error(`Telegram ${method} request failed`);
  }

  let untrustedBody: unknown;

  try {
    untrustedBody = await response.json();
  } catch {
    throw new Error(`Telegram ${method} returned invalid JSON`);
  }

  const envelope = telegramResponseSchema.safeParse(untrustedBody);

  if (!response.ok || !envelope.success || !envelope.data.ok) {
    throw new Error(`Telegram ${method} was rejected`);
  }

  const result = resultSchema.safeParse(envelope.data.result);

  if (!result.success) {
    throw new Error(`Telegram ${method} returned an invalid result`);
  }

  return result.data;
}

export async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyMarkup?: Record<string, unknown>,
): Promise<void> {
  await telegramRequest(
    "sendMessage",
    {
      chat_id: chatId,
      text: text.slice(0, 4096),
      link_preview_options: { is_disabled: true },
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    },
    z.object({ message_id: z.number().int() }).passthrough(),
  );
}

export async function sendTelegramDocument(
  chatId: number,
  file: { bytes: Uint8Array; fileName: string; mimeType: string },
  caption?: string,
): Promise<void> {
  if (file.bytes.byteLength > MAX_TELEGRAM_UPLOAD_BYTES) {
    throw new Error("Telegram upload exceeds the size limit");
  }

  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption.slice(0, 1024));
  form.append(
    "document",
    new Blob([new Uint8Array(file.bytes)], { type: file.mimeType }),
    file.fileName,
  );

  await telegramRequest(
    "sendDocument",
    form,
    z.object({ message_id: z.number().int() }).passthrough(),
  );
}

export async function answerTelegramCallback(
  callbackQueryId: string,
  text: string,
): Promise<void> {
  await telegramRequest(
    "answerCallbackQuery",
    {
      callback_query_id: callbackQueryId,
      text: text.slice(0, 200),
    },
    z.literal(true),
  );
}

async function readBoundedResponse(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!response.body) {
    throw new Error("Telegram file response has no body");
  }

  const declaredLength = Number(response.headers.get("content-length") ?? "0");

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > 0 &&
    declaredLength > maxBytes
  ) {
    throw new Error("Telegram file exceeds the size limit");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error("Telegram file exceeds the size limit");
    }

    chunks.push(value);
  }

  const output = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

export async function downloadTelegramFile(
  fileId: string,
): Promise<TelegramDownloadedFile> {
  const file = await telegramRequest(
    "getFile",
    { file_id: fileId },
    telegramFileSchema,
  );

  if (
    file.file_size &&
    file.file_size > MAX_TELEGRAM_FILE_BYTES
  ) {
    throw new Error("Telegram file exceeds the size limit");
  }

  if (
    file.file_path.includes("..") ||
    file.file_path.startsWith("/") ||
    !/^[A-Za-z0-9_./-]+$/.test(file.file_path)
  ) {
    throw new Error("Telegram returned an unsafe file path");
  }

  let response: Response;

  try {
    response = await fetch(
      `https://api.telegram.org/file/bot${botToken()}/${file.file_path}`,
      {
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      },
    );
  } catch {
    throw new Error("Telegram file download failed");
  }

  if (!response.ok) {
    throw new Error("Telegram file download was rejected");
  }

  const fileName = file.file_path.split("/").at(-1) || "telegram-file";
  const responseMimeType = response.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim();
  const mimeType =
    responseMimeType && responseMimeType !== "application/octet-stream"
      ? responseMimeType
      : inferMimeType(fileName);

  return {
    bytes: await readBoundedResponse(response, MAX_TELEGRAM_FILE_BYTES),
    mimeType,
    fileName,
  };
}
