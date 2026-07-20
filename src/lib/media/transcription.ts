import "server-only";

import { toFile } from "openai";

import { openAIClient } from "@/lib/ai/openai";
import { openAIEnv } from "@/lib/env/openai";

const AUDIO_MIME_TYPES = new Set([
  "audio/ogg",
  "application/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
]);

export async function transcribeAudio(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<string> {
  if (!AUDIO_MIME_TYPES.has(mimeType)) {
    throw new Error("Unsupported audio content type");
  }

  const upload = await toFile(bytes, fileName, { type: mimeType });
  const transcription = await openAIClient().audio.transcriptions.create({
    file: upload,
    model: openAIEnv.OPENAI_TRANSCRIBE_MODEL,
    response_format: "json",
    prompt: "Русская личная заметка. Сохраняй имена, числа и пунктуацию точно.",
  });
  const text = transcription.text.replace(/\s+/g, " ").trim();

  if (!text || text.length > 50_000) {
    throw new Error("Audio transcription is empty or too long");
  }

  return text;
}
