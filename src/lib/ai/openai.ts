import "server-only";

import OpenAI from "openai";

import { openAIEnv } from "@/lib/env/openai";

let client: OpenAI | null = null;

export function openAIClient(): OpenAI {
  if (client) {
    return client;
  }

  client = new OpenAI({
    apiKey: openAIEnv.OPENAI_API_KEY,
    timeout: 45_000,
    maxRetries: 2,
  });

  return client;
}
