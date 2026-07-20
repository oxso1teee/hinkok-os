import "server-only";

import { zodResponseFormat } from "openai/helpers/zod";

import { openAIClient } from "@/lib/ai/openai";
import { buildClassifierPrompt, CLASSIFIER_SYSTEM_PROMPT } from "@/lib/capture/prompt";
import { normalizeClassification } from "@/lib/capture/normalize";
import { classifyWithRegex } from "@/lib/capture/regex-classifier";
import {
  classifierModelOutputSchema,
  type CaptureClassification,
  type ClassifierSource,
  type KnownEntity,
} from "@/lib/capture/schema";
import { openAIEnv } from "@/lib/env/openai";

type ClassifyCaptureInput = {
  text: string;
  currentTime: string;
  timeZone: string;
  knownEntities: KnownEntity[];
};

export type ClassificationResult = {
  classification: CaptureClassification;
  source: ClassifierSource;
  fallbacksUsed: ClassifierSource[];
};

async function classifyWithOpenAI(
  input: ClassifyCaptureInput,
): Promise<CaptureClassification> {
  const completion = await openAIClient().chat.completions.parse({
    model: openAIEnv.OPENAI_CLASSIFIER_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
      {
        role: "user",
        content: buildClassifierPrompt(
          input.text,
          input.currentTime,
          input.timeZone,
          input.knownEntities,
        ),
      },
    ],
    response_format: zodResponseFormat(
      classifierModelOutputSchema,
      "capture_classification",
    ),
  });
  const message = completion.choices[0]?.message;

  if (!message || message.refusal || !message.parsed) {
    throw new Error("OpenAI classifier did not return a usable result");
  }

  return normalizeClassification(
    message.parsed,
    input.text,
    input.knownEntities,
  );
}

export async function classifyCapture(
  input: ClassifyCaptureInput,
): Promise<ClassificationResult> {
  const fallbacksUsed: ClassifierSource[] = [];

  try {
    return {
      classification: await classifyWithOpenAI(input),
      source: "openai",
      fallbacksUsed,
    };
  } catch {
    fallbacksUsed.push("openai");
  }

  return {
    classification: classifyWithRegex(input.text, input.knownEntities),
    source: "regex",
    fallbacksUsed,
  };
}
