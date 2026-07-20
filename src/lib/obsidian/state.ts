import { z } from "zod";

import {
  DEFAULT_OBSIDIAN_FOLDER_MAPPING,
  obsidianMappingVersion,
  type LifeSphere,
} from "./mapping";

const lifeSphereSchema = z.enum([
  "work",
  "finance",
  "health",
  "relationships",
  "growth",
  "mind",
  "personal",
  "content",
  "spirituality",
]);

const obsidianFileStateSchema = z
  .object({
    sha: z.string().regex(/^[a-f0-9]{40}$/),
    sourceKey: z.string().min(1).max(1500),
    sphere: lifeSphereSchema,
  })
  .strict();

export const obsidianSyncStateSchema = z
  .object({
    version: z.literal(1),
    mappingVersion: z.number().int().positive(),
    treeSha: z.string().regex(/^[a-f0-9]{40}$/),
    embeddingModel: z.string().min(1).max(200),
    files: z.record(z.string(), obsidianFileStateSchema),
  })
  .strict();

export type ObsidianFileState = {
  sha: string;
  sourceKey: string;
  sphere: LifeSphere;
};

export type ObsidianSyncState = z.infer<typeof obsidianSyncStateSchema>;

export function parseObsidianSyncState(
  value: unknown,
): ObsidianSyncState | null {
  const parsed = obsidianSyncStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function createEmptyObsidianSyncState(
  embeddingModel: string,
  mappingVersion = obsidianMappingVersion(DEFAULT_OBSIDIAN_FOLDER_MAPPING),
): ObsidianSyncState {
  return {
    version: 1,
    mappingVersion,
    treeSha: "0000000000000000000000000000000000000000",
    embeddingModel,
    files: {},
  };
}
