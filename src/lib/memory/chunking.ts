export const MEMORY_CHUNK_TARGET_TOKENS = 500;
export const MEMORY_CHUNK_OVERLAP_TOKENS = 100;
// OpenAI embeddings do not expose a tokenizer in this project. Four UTF-8
// characters per token is a conservative multilingual approximation.
export const MEMORY_ESTIMATED_CHARACTERS_PER_TOKEN = 4;
export const MEMORY_CHUNK_MAX_CHARACTERS =
  MEMORY_CHUNK_TARGET_TOKENS * MEMORY_ESTIMATED_CHARACTERS_PER_TOKEN;
export const MEMORY_CHUNK_OVERLAP_CHARACTERS =
  MEMORY_CHUNK_OVERLAP_TOKENS * MEMORY_ESTIMATED_CHARACTERS_PER_TOKEN;
export const MEMORY_MAX_CHUNKS = 128;

const RECURSIVE_SEPARATORS = ["\n\n", "\n", ". ", "! ", "? ", " "] as const;

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findBoundary(text: string, start: number, proposedEnd: number): number {
  const minimumEnd = Math.min(
    proposedEnd,
    start + Math.floor(MEMORY_CHUNK_MAX_CHARACTERS * 0.6),
  );
  const window = text.slice(minimumEnd, proposedEnd);

  for (const separator of RECURSIVE_SEPARATORS) {
    const index = window.lastIndexOf(separator);
    if (index >= 0) {
      return minimumEnd + index + separator.length;
    }
  }

  return proposedEnd;
}

function overlapStart(text: string, start: number, end: number): number {
  const earliest = Math.max(start + 1, end - MEMORY_CHUNK_OVERLAP_CHARACTERS);
  const overlapWindow = text.slice(earliest, end);

  for (const separator of RECURSIVE_SEPARATORS) {
    const index = overlapWindow.indexOf(separator);
    if (index >= 0) {
      return Math.min(end - 1, earliest + index + separator.length);
    }
  }

  return earliest;
}

export function splitMemoryText(value: string): string[] {
  const text = normalizeText(value);

  if (text.length === 0) {
    throw new Error("Memory text must not be empty");
  }

  if (text.length <= MEMORY_CHUNK_MAX_CHARACTERS) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const proposedEnd = Math.min(text.length, start + MEMORY_CHUNK_MAX_CHARACTERS);
    const end = proposedEnd === text.length
      ? proposedEnd
      : findBoundary(text, start, proposedEnd);
    const chunk = text.slice(start, end).trim();

    if (chunk.length > 0) chunks.push(chunk);

    if (chunks.length > MEMORY_MAX_CHUNKS) {
      throw new Error(`Memory text exceeds ${MEMORY_MAX_CHUNKS} chunks`);
    }

    if (end >= text.length) break;
    start = overlapStart(text, start, end);
  }

  return chunks;
}
