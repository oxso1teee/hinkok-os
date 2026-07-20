export const OBSIDIAN_MAPPING_VERSION = 2;

export type LifeSphere =
  | "work"
  | "finance"
  | "health"
  | "relationships"
  | "growth"
  | "mind"
  | "personal"
  | "content"
  | "spirituality";

export const DEFAULT_OBSIDIAN_FOLDER_MAPPING: Readonly<Record<string, LifeSphere>> = Object.freeze({
  clients: "work",
  business: "work",
  клиент: "work",
  клиенты: "work",
  бизнес: "work",
  video: "content",
  videos: "content",
  youtube: "content",
  scripts: "content",
  видео: "content",
  ютуб: "content",
  сценарии: "content",
  training: "health",
  workouts: "health",
  food: "health",
  nutrition: "health",
  тренировки: "health",
  еда: "health",
  питание: "health",
  research: "growth",
  books: "growth",
  исследования: "growth",
  книги: "growth",
  sessions: "mind",
  reflections: "mind",
  reflection: "mind",
  сессии: "mind",
  рефлексия: "mind",
});

export function obsidianMappingVersion(
  folderMapping: Readonly<Record<string, LifeSphere>>,
): number {
  const serialized = Object.entries(folderMapping)
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([folder, sphere]) => `${folder}:${sphere}`)
    .join("|");
  let hash = 2_166_136_261 ^ OBSIDIAN_MAPPING_VERSION;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) || OBSIDIAN_MAPPING_VERSION;
}

const SKIPPED_SEGMENTS = new Set([
  ".git",
  ".obsidian",
  ".trash",
  "trash",
  "trashes",
  "корзина",
]);

export function normalizeObsidianPath(untrustedPath: string): string | null {
  const normalized = untrustedPath
    .normalize("NFC")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\.\//, "")
    .trim();

  if (
    normalized.length === 0 ||
    normalized.length > 1024 ||
    normalized.startsWith("/") ||
    normalized.includes("\0")
  ) {
    return null;
  }

  const segments = normalized.split("/");

  if (
    segments.some(
      (segment) =>
        segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    return null;
  }

  return segments.join("/");
}

export function shouldSyncObsidianPath(untrustedPath: string): boolean {
  const path = normalizeObsidianPath(untrustedPath);

  if (!path || !path.toLocaleLowerCase("ru-RU").endsWith(".md")) {
    return false;
  }

  return !path.split("/").some((segment) =>
    SKIPPED_SEGMENTS.has(segment.toLocaleLowerCase("ru-RU")),
  );
}

export function sphereForObsidianPath(
  untrustedPath: string,
  folderMapping: Readonly<Record<string, LifeSphere>> = DEFAULT_OBSIDIAN_FOLDER_MAPPING,
): LifeSphere {
  const path = normalizeObsidianPath(untrustedPath);

  if (!path) {
    return "personal";
  }

  for (const segment of path.split("/").slice(0, -1)) {
    const sphere = folderMapping[segment.toLocaleLowerCase("ru-RU")];

    if (sphere) {
      return sphere;
    }
  }

  return "personal";
}

export function selectVaultPath(
  repositoryPath: string,
  vaultName: string,
  repositoryContainsVaultFolder: boolean,
): string | null {
  const path = normalizeObsidianPath(repositoryPath);

  if (!path) {
    return null;
  }

  if (!repositoryContainsVaultFolder) {
    return path;
  }

  const prefix = `${vaultName.normalize("NFC")}/`;

  return path.startsWith(prefix) ? path.slice(prefix.length) : null;
}

export function obsidianSourceKey(
  repository: string,
  vaultPath: string,
): string {
  return `obsidian:${repository}:${vaultPath}`;
}

export function obsidianNoteTitle(vaultPath: string): string {
  const filename = vaultPath.split("/").at(-1) ?? vaultPath;
  return filename.replace(/\.md$/i, "").trim() || "Untitled";
}
