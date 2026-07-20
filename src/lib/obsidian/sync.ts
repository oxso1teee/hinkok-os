import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import { obsidianEnv, isObsidianConfigured } from "@/lib/env/obsidian";
import { openAIEnv } from "@/lib/env/openai";
import { serverEnv } from "@/lib/env/server";
import {
  getGitHubBlobText,
  getGitHubTree,
  MAX_OBSIDIAN_NOTE_BYTES,
  type GitHubTreeEntry,
} from "@/lib/obsidian/github";
import {
  normalizeObsidianPath,
  obsidianMappingVersion,
  obsidianNoteTitle,
  obsidianSourceKey,
  selectVaultPath,
  shouldSyncObsidianPath,
  sphereForObsidianPath,
} from "@/lib/obsidian/mapping";
import {
  createEmptyObsidianSyncState,
  parseObsidianSyncState,
  type ObsidianFileState,
  type ObsidianSyncState,
} from "@/lib/obsidian/state";
import { deleteMemorySources, indexMemory } from "@/lib/memory/indexing";
import { db } from "@/lib/supabase/admin";
import { getPersonalSettings } from "@/lib/settings/repository";
import type { Json } from "@/types/database";

const MAX_CHANGED_BYTES_PER_SYNC = 25 * 1024 * 1024;
const INDEX_CONCURRENCY = 4;

type SyncCandidate = {
  repositoryPath: string;
  vaultPath: string;
  sha: string;
  size?: number;
  sourceKey: string;
  sphere: ObsidianFileState["sphere"];
};

export type ObsidianSyncResult = {
  status: "unchanged" | "synchronized";
  treeSha: string;
  noteCount: number;
  changedCount: number;
  removedCount: number;
  indexedCount: number;
  emptyCount: number;
  embeddedCount: number;
  reusedChunkCount: number;
};

function syncCacheKey(repository: string, branch: string): string {
  return `obsidian-sync:${serverEnv.USER_ID}:${repository}:${branch}`;
}

async function readSyncState(
  cacheKey: string,
  mappingVersion: number,
): Promise<ObsidianSyncState> {
  const { data, error } = await db()
    .from("kv_cache")
    .select("value")
    .eq("key", cacheKey)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to read the Obsidian sync state", {
      cause: error,
    });
  }

  return (
    parseObsidianSyncState(data?.value) ??
    createEmptyObsidianSyncState(
      openAIEnv.OPENAI_EMBEDDING_MODEL,
      mappingVersion,
    )
  );
}

async function writeSyncState(
  cacheKey: string,
  state: ObsidianSyncState,
): Promise<void> {
  const { error } = await db().from("kv_cache").upsert(
    {
      key: cacheKey,
      value: state as unknown as Json,
    },
    { onConflict: "key" },
  );

  if (error) {
    throw new Error("Unable to store the Obsidian sync state", {
      cause: error,
    });
  }
}

function isIndexableBlob(entry: GitHubTreeEntry): boolean {
  return (
    entry.type === "blob" &&
    (entry.mode === "100644" || entry.mode === "100755")
  );
}

function buildCandidates(
  entries: GitHubTreeEntry[],
  repository: string,
  vaultName: string,
  folderMapping: Awaited<ReturnType<typeof getPersonalSettings>>["settings"]["obsidianFolderMapping"],
): Map<string, SyncCandidate> {
  const normalizedVaultName = vaultName.normalize("NFC");
  const repositoryContainsVaultFolder = entries.some(
    (entry) =>
      entry.type === "tree" &&
      normalizeObsidianPath(entry.path) === normalizedVaultName,
  );
  const candidates = new Map<string, SyncCandidate>();

  for (const entry of entries) {
    if (!isIndexableBlob(entry)) {
      continue;
    }

    const vaultPath = selectVaultPath(
      entry.path,
      normalizedVaultName,
      repositoryContainsVaultFolder,
    );

    if (!vaultPath || !shouldSyncObsidianPath(vaultPath)) {
      continue;
    }

    if (entry.size !== undefined && entry.size > MAX_OBSIDIAN_NOTE_BYTES) {
      throw new Error(`Obsidian note exceeds the size limit: ${vaultPath}`);
    }

    if (candidates.has(vaultPath)) {
      throw new Error(`Duplicate Obsidian vault path: ${vaultPath}`);
    }

    candidates.set(vaultPath, {
      repositoryPath: entry.path,
      vaultPath,
      sha: entry.sha,
      size: entry.size,
      sourceKey: obsidianSourceKey(repository, vaultPath),
      sphere: sphereForObsidianPath(vaultPath, folderMapping),
    });
  }

  return candidates;
}

async function runWithConcurrency<T>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;

  const runners = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        await worker(values[index]);
      }
    },
  );

  await Promise.all(runners);
}

export async function syncObsidianMemory(): Promise<ObsidianSyncResult> {
  if (
    !isObsidianConfigured() ||
    !obsidianEnv.OBSIDIAN_REPO ||
    !obsidianEnv.OBSIDIAN_VAULT_NAME
  ) {
    throw new Error("Obsidian integration is not configured");
  }

  const repository = obsidianEnv.OBSIDIAN_REPO;
  const branch = obsidianEnv.OBSIDIAN_BRANCH;
  const cacheKey = syncCacheKey(repository, branch);
  const settingsResult = await getPersonalSettings();
  const folderMapping = settingsResult.settings.obsidianFolderMapping;
  const mappingVersion = obsidianMappingVersion(folderMapping);
  const [tree, previousState] = await Promise.all([
    getGitHubTree(),
    readSyncState(cacheKey, mappingVersion),
  ]);
  const candidates = buildCandidates(
    tree.entries,
    repository,
    obsidianEnv.OBSIDIAN_VAULT_NAME,
    folderMapping,
  );
  const stateIsCurrent =
    previousState.treeSha === tree.sha &&
    previousState.mappingVersion === mappingVersion &&
    previousState.embeddingModel === openAIEnv.OPENAI_EMBEDDING_MODEL;

  if (stateIsCurrent) {
    return {
      status: "unchanged",
      treeSha: tree.sha,
      noteCount: candidates.size,
      changedCount: 0,
      removedCount: 0,
      indexedCount: 0,
      emptyCount: 0,
      embeddedCount: 0,
      reusedChunkCount: 0,
    };
  }

  const forceReindex =
    previousState.mappingVersion !== mappingVersion ||
    previousState.embeddingModel !== openAIEnv.OPENAI_EMBEDDING_MODEL;
  const changed = [...candidates.values()].filter((candidate) => {
    const previous = previousState.files[candidate.vaultPath];
    return (
      forceReindex ||
      !previous ||
      previous.sha !== candidate.sha ||
      previous.sourceKey !== candidate.sourceKey ||
      previous.sphere !== candidate.sphere
    );
  });
  const knownChangedBytes = changed.reduce(
    (total, candidate) => total + (candidate.size ?? 0),
    0,
  );

  if (knownChangedBytes > MAX_CHANGED_BYTES_PER_SYNC) {
    throw new Error("Changed Obsidian notes exceed the per-sync byte limit");
  }

  const removedSourceKeys = Object.entries(previousState.files)
    .filter(([vaultPath]) => !candidates.has(vaultPath))
    .map(([, file]) => file.sourceKey);

  await deleteMemorySources({
    sourceType: "obsidian",
    sourceKeys: removedSourceKeys,
  });

  let downloadedBytes = 0;
  let indexedCount = 0;
  let emptyCount = 0;
  let embeddedCount = 0;
  let reusedChunkCount = 0;

  await runWithConcurrency(changed, INDEX_CONCURRENCY, async (candidate) => {
    const content = await getGitHubBlobText(candidate.sha, candidate.size);
    downloadedBytes += Buffer.byteLength(content, "utf8");

    if (downloadedBytes > MAX_CHANGED_BYTES_PER_SYNC) {
      throw new Error("Changed Obsidian notes exceed the per-sync byte limit");
    }

    if (content.trim().length === 0) {
      await deleteMemorySources({
        sourceType: "obsidian",
        sourceKeys: [candidate.sourceKey],
      });
      emptyCount += 1;
      return;
    }

    const title = obsidianNoteTitle(candidate.vaultPath);
    const result = await indexMemory({
      sourceType: "obsidian",
      sourceKey: candidate.sourceKey,
      text: `Obsidian note: ${title}\nPath: ${candidate.vaultPath}\n\n${content}`,
      metadata: {
        path: candidate.vaultPath,
        repositoryPath: candidate.repositoryPath,
        title,
        sphere: candidate.sphere,
        blobSha: candidate.sha,
        repository,
        vault: obsidianEnv.OBSIDIAN_VAULT_NAME,
      },
    });
    indexedCount += 1;
    embeddedCount += result.embeddedCount;
    reusedChunkCount += result.reusedCount;
  });

  const files: Record<string, ObsidianFileState> = {};

  for (const candidate of candidates.values()) {
    files[candidate.vaultPath] = {
      sha: candidate.sha,
      sourceKey: candidate.sourceKey,
      sphere: candidate.sphere,
    };
  }

  const nextState: ObsidianSyncState = {
    version: 1,
    mappingVersion,
    treeSha: tree.sha,
    embeddingModel: openAIEnv.OPENAI_EMBEDDING_MODEL,
    files,
  };

  await writeSyncState(cacheKey, nextState);
  await recordAuditEvent({
    action: "obsidian.sync_completed",
    resourceType: "obsidian",
    metadata: {
      treeSha: tree.sha,
      noteCount: candidates.size,
      changedCount: changed.length,
      removedCount: removedSourceKeys.length,
      indexedCount,
      emptyCount,
      embeddedCount,
      reusedChunkCount,
    },
  });

  return {
    status: "synchronized",
    treeSha: tree.sha,
    noteCount: candidates.size,
    changedCount: changed.length,
    removedCount: removedSourceKeys.length,
    indexedCount,
    emptyCount,
    embeddedCount,
    reusedChunkCount,
  };
}
