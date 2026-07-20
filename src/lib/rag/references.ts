import type { Json } from "@/types/database";

export type RagMatch = {
  id: string;
  source_type: string;
  source_id: string | null;
  source_key: string;
  chunk_index: number;
  text: string;
  metadata: Json;
  similarity: number;
};

export type RagSource = {
  ref: number;
  sourceType: string;
  sourceId: string | null;
  sourceKey: string;
  chunkIndex: number;
  title: string | null;
  path: string | null;
  sphere: string | null;
  similarity: number;
  excerpt: string;
  href: string;
  label: string;
};

function metadataString(metadata: Json, key: string): string | null {
  if (
    typeof metadata !== "object" ||
    metadata === null ||
    Array.isArray(metadata)
  ) {
    return null;
  }

  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}


function sourceHref(sourceType: string, path: string | null): string {
  if (sourceType === "obsidian" && path) {
    return `obsidian://open?file=${encodeURIComponent(path)}`;
  }

  if (sourceType.includes("journal") || sourceType === "daily_log") {
    return "/journal";
  }

  return "/brain";
}

function sourceLabel(path: string | null, title: string | null, sourceType: string): string {
  if (path) return path.split("/").filter(Boolean).at(-1) ?? path;
  return title ?? sourceType;
}

function compactText(value: string, maximumLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maximumLength) {
    return compact;
  }

  return `${compact.slice(0, maximumLength - 1).trimEnd()}…`;
}

export function buildRagSources(matches: RagMatch[]): RagSource[] {
  return matches.map((match, index) => {
    const title = metadataString(match.metadata, "title");
    const path = metadataString(match.metadata, "path");

    return {
      ref: index + 1,
      sourceType: match.source_type,
      sourceId: match.source_id,
      sourceKey: match.source_key,
      chunkIndex: match.chunk_index,
      title,
      path,
      sphere: metadataString(match.metadata, "sphere"),
      similarity: Math.round(match.similarity * 10_000) / 10_000,
      excerpt: compactText(match.text, 360),
      href: sourceHref(match.source_type, path),
      label: sourceLabel(path, title, match.source_type),
    };
  });
}

export function buildGroundedContext(
  matches: RagMatch[],
  maximumCharacters = 60_000,
): string {
  const sections: string[] = [];
  let usedCharacters = 0;

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const source = buildRagSources([match])[0];
    const header = JSON.stringify({
      ref: `ref:${index + 1}`,
      sourceType: source.sourceType,
      sourceKey: source.sourceKey,
      chunkIndex: source.chunkIndex,
      title: source.title,
      path: source.path,
      sphere: source.sphere,
    });
    const prefix = `--- SOURCE [ref:${index + 1}] ---\n${header}\n`;
    const suffix = "\n--- END SOURCE ---";
    const remaining = maximumCharacters - usedCharacters - prefix.length - suffix.length;

    if (remaining <= 0) {
      break;
    }

    const text = match.text.slice(0, remaining);
    const section = `${prefix}${text}${suffix}`;
    sections.push(section);
    usedCharacters += section.length + 2;

    if (text.length < match.text.length) {
      break;
    }
  }

  return sections.join("\n\n");
}

export function normalizeGroundedAnswer(
  untrustedAnswer: string,
  sourceCount: number,
): string {
  let answer = untrustedAnswer
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, 12_000)
    .replace(/\[ref:(\d+)\]/gi, (citation, rawIndex: string) => {
      const index = Number(rawIndex);
      return index >= 1 && index <= sourceCount
        ? `[ref:${index}]`
        : "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  if (!answer) {
    answer = "Не удалось сформировать ответ по найденным данным.";
  }

  if (sourceCount > 0 && !/\[ref:\d+\]/.test(answer)) {
    const references = Array.from(
      { length: Math.min(sourceCount, 3) },
      (_, index) => `[ref:${index + 1}]`,
    ).join(" ");
    answer = `${answer}\n\nИсточники: ${references}`;
  }

  return answer;
}
