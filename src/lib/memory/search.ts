import "server-only";

import { createHash } from "node:crypto";

import { createEmbeddings, serializeEmbedding } from "@/lib/ai/embeddings";
import { recordAuditEvent } from "@/lib/audit";
import { serverEnv } from "@/lib/env/server";
import { db } from "@/lib/supabase/admin";

type SearchMemoryInput = {
  query: string;
  matchCount?: number;
  minSimilarity?: number;
};

export async function searchMemory(input: SearchMemoryInput) {
  const [embedding] = await createEmbeddings([input.query]);
  const { data, error } = await db().rpc("match_memory_chunks", {
    query_embedding: serializeEmbedding(embedding),
    match_count: input.matchCount ?? 20,
    filter_user_id: serverEnv.USER_ID,
  });

  if (error) {
    throw new Error("Unable to search memory", { cause: error });
  }

  const minSimilarity = input.minSimilarity ?? 0;
  const matches = (data ?? []).filter(
    (match) => match.similarity >= minSimilarity,
  );
  const queryHash = createHash("sha256")
    .update(input.query, "utf8")
    .digest("hex");

  await recordAuditEvent({
    action: "memory.searched",
    resourceType: "memory",
    metadata: {
      queryHash,
      requestedCount: input.matchCount ?? 20,
      minSimilarity,
      resultCount: matches.length,
    },
  });

  return matches;
}
