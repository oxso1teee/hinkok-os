import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { createEmbeddings, serializeEmbedding } from "@/lib/ai/embeddings";
import { recordAuditEvent } from "@/lib/audit";
import { openAIEnv } from "@/lib/env/openai";
import { serverEnv } from "@/lib/env/server";
import { splitMemoryText } from "@/lib/memory/chunking";
import { db } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

type IndexMemoryInput = {
  sourceType: string;
  sourceId?: string | null;
  sourceKey?: string;
  text: string;
  metadata?: Json;
};

export type IndexMemoryResult = {
  sourceKey: string;
  chunkCount: number;
  embeddedCount: number;
  reusedCount: number;
};

type DeleteMemorySourcesInput = {
  sourceType: string;
  sourceKeys: string[];
};

type ExistingChunk = {
  chunk_index: number;
  content_hash: string;
  embedding: string | null;
  embedding_model: string;
};

function contentHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function indexMemory(
  input: IndexMemoryInput,
): Promise<IndexMemoryResult> {
  const sourceKey = input.sourceKey?.trim() || randomUUID();
  const chunks = splitMemoryText(input.text);
  const hashes = chunks.map(contentHash);
  const { data: existingData, error: existingError } = await db()
    .from("memory_chunks")
    .select("chunk_index, content_hash, embedding, embedding_model")
    .eq("user_id", serverEnv.USER_ID)
    .eq("source_type", input.sourceType)
    .eq("source_key", sourceKey);

  if (existingError) {
    throw new Error("Unable to read existing memory chunks", {
      cause: existingError,
    });
  }

  const existingByIndex = new Map<number, ExistingChunk>(
    (existingData ?? []).map((chunk) => [chunk.chunk_index, chunk]),
  );
  const changedIndexes: number[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const existing = existingByIndex.get(index);

    if (
      !existing ||
      existing.content_hash !== hashes[index] ||
      existing.embedding_model !== openAIEnv.OPENAI_EMBEDDING_MODEL ||
      existing.embedding === null
    ) {
      changedIndexes.push(index);
    }
  }

  const generatedEmbeddings = await createEmbeddings(
    changedIndexes.map((index) => chunks[index]),
  );
  const generatedByIndex = new Map<number, string>();

  for (let position = 0; position < changedIndexes.length; position += 1) {
    generatedByIndex.set(
      changedIndexes[position],
      serializeEmbedding(generatedEmbeddings[position]),
    );
  }

  const rows = chunks.map((text, chunkIndex) => {
    const generated = generatedByIndex.get(chunkIndex);
    const existing = existingByIndex.get(chunkIndex);
    const embedding = generated ?? existing?.embedding;

    if (!embedding) {
      throw new Error("Unable to resolve an embedding for a memory chunk");
    }

    return {
      user_id: serverEnv.USER_ID,
      source_type: input.sourceType,
      source_id: input.sourceId ?? null,
      source_key: sourceKey,
      chunk_index: chunkIndex,
      text,
      embedding,
      content_hash: hashes[chunkIndex],
      embedding_model: openAIEnv.OPENAI_EMBEDDING_MODEL,
      metadata: input.metadata ?? {},
    };
  });

  const { error: upsertError } = await db().from("memory_chunks").upsert(rows, {
    onConflict: "user_id,source_type,source_key,chunk_index",
  });

  if (upsertError) {
    throw new Error("Unable to store memory chunks", { cause: upsertError });
  }

  const { error: staleChunksError } = await db()
    .from("memory_chunks")
    .delete()
    .eq("user_id", serverEnv.USER_ID)
    .eq("source_type", input.sourceType)
    .eq("source_key", sourceKey)
    .gte("chunk_index", chunks.length);

  if (staleChunksError) {
    throw new Error("Unable to remove stale memory chunks", {
      cause: staleChunksError,
    });
  }

  await recordAuditEvent({
    action: "memory.indexed",
    resourceType: input.sourceType,
    resourceId: input.sourceId ?? null,
    metadata: {
      sourceKey,
      chunkCount: chunks.length,
      embeddedCount: changedIndexes.length,
      reusedCount: chunks.length - changedIndexes.length,
    },
  });

  return {
    sourceKey,
    chunkCount: chunks.length,
    embeddedCount: changedIndexes.length,
    reusedCount: chunks.length - changedIndexes.length,
  };
}

export async function deleteMemorySources(
  input: DeleteMemorySourcesInput,
): Promise<number> {
  const sourceKeys = [...new Set(input.sourceKeys.map((key) => key.trim()))]
    .filter(Boolean);

  if (sourceKeys.length === 0) {
    return 0;
  }

  const batchSize = 100;

  for (let offset = 0; offset < sourceKeys.length; offset += batchSize) {
    const batch = sourceKeys.slice(offset, offset + batchSize);
    const { error } = await db()
      .from("memory_chunks")
      .delete()
      .eq("user_id", serverEnv.USER_ID)
      .eq("source_type", input.sourceType)
      .in("source_key", batch);

    if (error) {
      throw new Error("Unable to delete memory sources", { cause: error });
    }
  }

  await recordAuditEvent({
    action: "memory.sources_deleted",
    resourceType: input.sourceType,
    metadata: { sourceCount: sourceKeys.length },
  });

  return sourceKeys.length;
}
