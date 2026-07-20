import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import { deleteMemorySources, indexMemory } from "@/lib/memory/indexing";
import { parseObsidianMarkdown } from "@/lib/obsidian/frontmatter";
import {
  normalizeObsidianPath,
  obsidianNoteTitle,
  shouldSyncObsidianPath,
  sphereForObsidianPath,
} from "@/lib/obsidian/mapping";
import { getPersonalSettings } from "@/lib/settings/repository";

export type ObsidianBatchFile = {
  path: string;
  content: string;
};

export type ObsidianBatchSyncInput = {
  files: ObsidianBatchFile[];
  deletedPaths: string[];
};

export type ObsidianBatchSyncResult = {
  indexedFiles: number;
  deletedFiles: number;
  chunkCount: number;
  embeddedCount: number;
  reusedCount: number;
};

function sourceKey(path: string): string {
  return `obsidian:direct:${path}`;
}

export async function syncObsidianBatch(
  input: ObsidianBatchSyncInput,
): Promise<ObsidianBatchSyncResult> {
  const settings = await getPersonalSettings();
  const folderMapping = settings.settings.obsidianFolderMapping;
  const files = new Map<string, ObsidianBatchFile>();

  for (const file of input.files) {
    const path = normalizeObsidianPath(file.path);

    if (!path || !shouldSyncObsidianPath(path)) {
      throw new Error("Invalid Obsidian Markdown path");
    }

    if (files.has(path)) {
      throw new Error("Duplicate Obsidian Markdown path");
    }

    files.set(path, { path, content: file.content });
  }

  const deletedPaths = Array.from(
    new Set(
      input.deletedPaths.map((value) => normalizeObsidianPath(value)),
    ),
  ).filter((path): path is string => Boolean(path && shouldSyncObsidianPath(path)));

  for (const path of deletedPaths) {
    if (files.has(path)) {
      throw new Error("A note cannot be uploaded and deleted in one batch");
    }
  }

  const deletedFiles = await deleteMemorySources({
    sourceType: "obsidian",
    sourceKeys: deletedPaths.map(sourceKey),
  });
  let chunkCount = 0;
  let embeddedCount = 0;
  let reusedCount = 0;

  for (const file of files.values()) {
    const parsed = parseObsidianMarkdown(file.content);

    if (!parsed.body && Object.keys(parsed.frontmatter.properties).length === 0) {
      await deleteMemorySources({
        sourceType: "obsidian",
        sourceKeys: [sourceKey(file.path)],
      });
      continue;
    }

    const title = parsed.frontmatter.title ?? obsidianNoteTitle(file.path);
    const searchableText = [
      `Obsidian note: ${title}`,
      `Path: ${file.path}`,
      parsed.frontmatter.created
        ? `Created: ${parsed.frontmatter.created}`
        : null,
      parsed.frontmatter.tags.length
        ? `Tags: ${parsed.frontmatter.tags.join(", ")}`
        : null,
      "",
      parsed.body,
    ].filter((value): value is string => value !== null).join("\n");
    const result = await indexMemory({
      sourceType: "obsidian",
      sourceKey: sourceKey(file.path),
      text: searchableText,
      metadata: {
        path: file.path,
        title,
        sphere: sphereForObsidianPath(file.path, folderMapping),
        tags: parsed.frontmatter.tags,
        created: parsed.frontmatter.created,
        syncMode: "direct",
      },
    });
    chunkCount += result.chunkCount;
    embeddedCount += result.embeddedCount;
    reusedCount += result.reusedCount;
  }

  await recordAuditEvent({
    action: "obsidian.batch_sync_completed",
    resourceType: "obsidian",
    metadata: {
      indexedFiles: files.size,
      deletedFiles,
      chunkCount,
      embeddedCount,
      reusedCount,
    },
  });

  return {
    indexedFiles: files.size,
    deletedFiles,
    chunkCount,
    embeddedCount,
    reusedCount,
  };
}
