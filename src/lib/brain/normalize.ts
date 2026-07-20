import { isBrainSphere, type BrainSphere } from "@/lib/brain/config";
import type { Json } from "@/types/database";

export type BrainNote = {
  id: string;
  sourceType: string;
  sourceKey: string;
  title: string;
  excerpt: string;
  path: string | null;
  sphere: BrainSphere;
  createdAt: string;
};

export type BrainBriefing = {
  sphere: BrainSphere;
  text: string;
  provider: "openai" | "extractive" | "none";
  generatedAt: string;
  taskCount: number;
  noteCount: number;
};

type MemoryRow = {
  id: string;
  source_type: string;
  source_key: string;
  chunk_index: number;
  text: string;
  metadata: Json;
  created_at: string;
};

function record(value: Json): Record<string, Json | undefined> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}

export function brainMetadataString(metadata: Json, key: string): string | null {
  const value = record(metadata)[key];
  return typeof value === "string" && value.trim()
    ? value.replace(/\s+/g, " ").trim().slice(0, 1_024)
    : null;
}

function compact(value: string, maximumLength: number): string {
  const clean = value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
  return clean.length <= maximumLength
    ? clean
    : `${clean.slice(0, maximumLength - 1).trimEnd()}…`;
}

export function brainTitleFromText(text: string): string {
  const titleLine = text.match(/^(?:Title|Obsidian note):\s*(.+)$/imu)?.[1];
  const fallback = text.split(/\n/u).find((line) => line.trim()) ?? "Без названия";
  return compact(titleLine ?? fallback, 120) || "Без названия";
}

export function normalizeBrainNotes(rows: MemoryRow[]): BrainNote[] {
  const notes = new Map<string, BrainNote>();

  for (const row of rows) {
    const sphereValue = brainMetadataString(row.metadata, "sphere");
    if (!sphereValue || !isBrainSphere(sphereValue)) continue;
    const kind = brainMetadataString(row.metadata, "kind");
    const isNote = row.source_type === "obsidian" || [
      "note",
      "idea",
      "decision",
      "journal",
      "content",
      "person",
    ].includes(kind ?? "");
    if (!isNote) continue;

    const identity = `${row.source_type}:${row.source_key}`;
    if (notes.has(identity)) continue;
    const title = brainMetadataString(row.metadata, "title") ?? brainTitleFromText(row.text);
    const path = brainMetadataString(row.metadata, "path");

    notes.set(identity, {
      id: row.id,
      sourceType: row.source_type,
      sourceKey: row.source_key,
      title,
      excerpt: compact(row.text, 520),
      path,
      sphere: sphereValue,
      createdAt: row.created_at,
    });
  }

  return [...notes.values()];
}

export function normalizeCachedBriefing(value: Json): BrainBriefing | null {
  const data = record(value);
  if (
    typeof data.sphere !== "string" ||
    !isBrainSphere(data.sphere) ||
    typeof data.text !== "string" ||
    !data.text.trim() ||
    data.text.length > 12_000 ||
    !["openai", "extractive", "none"].includes(String(data.provider)) ||
    typeof data.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(data.generatedAt)) ||
    typeof data.taskCount !== "number" ||
    !Number.isInteger(data.taskCount) ||
    data.taskCount < 0 ||
    typeof data.noteCount !== "number" ||
    !Number.isInteger(data.noteCount) ||
    data.noteCount < 0
  ) {
    return null;
  }

  return {
    sphere: data.sphere,
    text: data.text.replace(/\u0000/g, "").trim(),
    provider: data.provider as BrainBriefing["provider"],
    generatedAt: data.generatedAt,
    taskCount: data.taskCount,
    noteCount: data.noteCount,
  };
}

export function normalizeBriefingText(text: string, sourceCount = 40): string {
  let clean = text
    .replace(/\u0000/g, "")
    .replace(/\[ref:(\d+)\]/gi, (citation, rawIndex: string) => {
      const index = Number(rawIndex);
      return index >= 1 && index <= sourceCount ? `[ref:${index}]` : "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, 12_000);

  if (!clean) {
    clean = "Не удалось сформировать брифинг по доступным данным.";
  }

  if (sourceCount > 0 && !/\[ref:\d+\]/u.test(clean)) {
    const references = Array.from(
      { length: Math.min(sourceCount, 3) },
      (_, index) => `[ref:${index + 1}]`,
    ).join(" ");
    clean = `${clean}\n\nИсточники: ${references}`;
  }

  return clean;
}
