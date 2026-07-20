import "server-only";

import { z } from "zod";

const openAIEnvironmentSchema = z.object({
  OPENAI_API_KEY: z
    .string()
    .trim()
    .min(20, "OPENAI_API_KEY is missing or too short"),
  OPENAI_EMBEDDING_MODEL: z.literal("text-embedding-3-small"),
  OPENAI_CLASSIFIER_MODEL: z.string().trim().min(1).default("gpt-4o-mini"),
  OPENAI_TRANSCRIBE_MODEL: z
    .enum(["whisper-1", "gpt-4o-mini-transcribe", "gpt-4o-transcribe"])
    .default("whisper-1"),
});

const parsedEnvironment = openAIEnvironmentSchema.safeParse({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_EMBEDDING_MODEL:
    process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
  OPENAI_CLASSIFIER_MODEL: process.env.OPENAI_CLASSIFIER_MODEL,
  OPENAI_TRANSCRIBE_MODEL: process.env.OPENAI_TRANSCRIBE_MODEL,
});

if (!parsedEnvironment.success) {
  const invalidFields = parsedEnvironment.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid OpenAI environment variables: ${invalidFields}`);
}

export const openAIEnv = Object.freeze(parsedEnvironment.data);
