export type ObsidianFrontmatter = {
  title: string | null;
  created: string | null;
  tags: string[];
  properties: Record<string, string | string[]>;
};

export type ParsedObsidianMarkdown = {
  body: string;
  frontmatter: ObsidianFrontmatter;
};

const FRONTMATTER_DELIMITER = "---";
const MAX_FRONTMATTER_CHARACTERS = 32_768;
const MAX_PROPERTY_COUNT = 64;

function cleanScalar(value: string): string {
  const trimmed = value.trim();
  const unquoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
      ? trimmed.slice(1, -1)
      : trimmed;

  return unquoted.replace(/\s+/g, " ").trim().slice(0, 512);
}

function parseInlineList(value: string): string[] | null {
  const trimmed = value.trim();

  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }

  return trimmed
    .slice(1, -1)
    .split(",")
    .map(cleanScalar)
    .filter(Boolean)
    .slice(0, 32);
}

function normalizeTags(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,]+/u)
      : [];

  return Array.from(
    new Set(
      values
        .map((tag) => tag.replace(/^#/u, "").trim().slice(0, 64))
        .filter(Boolean),
    ),
  ).slice(0, 32);
}

export function parseObsidianMarkdown(markdown: string): ParsedObsidianMarkdown {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const empty: ParsedObsidianMarkdown = {
    body: normalized.trim(),
    frontmatter: { title: null, created: null, tags: [], properties: {} },
  };

  if (!normalized.startsWith(`${FRONTMATTER_DELIMITER}\n`)) {
    return empty;
  }

  const closingIndex = normalized.indexOf(
    `\n${FRONTMATTER_DELIMITER}\n`,
    FRONTMATTER_DELIMITER.length + 1,
  );

  if (
    closingIndex < 0 ||
    closingIndex > MAX_FRONTMATTER_CHARACTERS
  ) {
    return empty;
  }

  const raw = normalized.slice(FRONTMATTER_DELIMITER.length + 1, closingIndex);
  const properties: Record<string, string | string[]> = {};

  for (const line of raw.split("\n")) {
    if (Object.keys(properties).length >= MAX_PROPERTY_COUNT) break;
    if (!line.trim() || /^\s*#/u.test(line)) continue;
    const match = line.match(/^([A-Za-z0-9_-]{1,64}):\s*(.*)$/u);
    if (!match) continue;
    const key = match[1].toLocaleLowerCase("en-US");
    const list = parseInlineList(match[2]);
    properties[key] = list ?? cleanScalar(match[2]);
  }

  const scalar = (key: string): string | null => {
    const value = properties[key];
    return typeof value === "string" && value ? value : null;
  };
  const tagsValue = properties.tags ?? properties.tag;

  return {
    body: normalized.slice(closingIndex + 5).trim(),
    frontmatter: {
      title: scalar("title"),
      created:
        scalar("created") ?? scalar("date") ?? scalar("created_at"),
      tags: normalizeTags(tagsValue),
      properties,
    },
  };
}
