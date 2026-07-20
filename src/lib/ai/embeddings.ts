import "server-only";

import { createHash } from "node:crypto";

import { openAIClient } from "@/lib/ai/openai";
import { openAIEnv } from "@/lib/env/openai";
import { serverEnv } from "@/lib/env/server";

export const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_BATCH_SIZE = 64;
const OPENAI_END_USER_ID = createHash("sha256")
  .update(serverEnv.USER_ID, "utf8")
  .digest("hex");

function validateEmbedding(vector: number[]): void {
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, received ${vector.length}`,
    );
  }

  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding contains a non-finite value");
  }
}

export function serializeEmbedding(vector: number[]): string {
  validateEmbedding(vector);
  return JSON.stringify(vector);
}

export async function createEmbeddings(
  inputs: string[],
): Promise<number[][]> {
  if (inputs.length === 0) {
    return [];
  }

  if (inputs.some((input) => input.trim().length === 0)) {
    throw new Error("Embedding input must not be empty");
  }

  const output: number[][] = [];

  for (let offset = 0; offset < inputs.length; offset += EMBEDDING_BATCH_SIZE) {
    const batch = inputs.slice(offset, offset + EMBEDDING_BATCH_SIZE);
    const response = await openAIClient().embeddings.create({
      model: openAIEnv.OPENAI_EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: "float",
      user: OPENAI_END_USER_ID,
    });

    const ordered = [...response.data].sort((left, right) => {
      return left.index - right.index;
    });

    if (ordered.length !== batch.length) {
      throw new Error("OpenAI returned an unexpected number of embeddings");
    }

    for (let index = 0; index < ordered.length; index += 1) {
      const item = ordered[index];

      if (item.index !== index) {
        throw new Error("OpenAI returned invalid embedding indexes");
      }

      validateEmbedding(item.embedding);
      output.push(item.embedding);
    }
  }

  return output;
}
