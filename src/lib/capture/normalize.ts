import {
  captureClassificationSchema,
  captureKindSchema,
  lifeSphereSchema,
  taskUrgencySchema,
  type CaptureClassification,
  type KnownEntity,
} from "@/lib/capture/schema";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return value as UnknownRecord;
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength).trim();
}

function fallbackTitle(text: string): string {
  const firstLine = cleanText(text.split(/\n|[.!?](?:\s|$)/u)[0], 80);
  return firstLine || "Captured note";
}

function groundedTitle(value: unknown, originalText: string): string {
  const candidate = cleanText(value, 80);

  if (!candidate) {
    return fallbackTitle(originalText);
  }

  const candidateUrls = candidate.match(/(?:https?:\/\/|www\.)\S+/giu) ?? [];

  if (candidateUrls.some((url) => !originalText.includes(url))) {
    return fallbackTitle(originalText);
  }

  return candidate;
}

function isZonedIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) {
    return false;
  }

  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) {
    return false;
  }

  return Number.isFinite(Date.parse(value));
}

function normalizeTags(value: unknown, fallback: string[]): string[] {
  const rawTags = Array.isArray(value) ? value : [];
  const normalized = rawTags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) =>
      tag
        .toLocaleLowerCase("ru")
        .replace(/[^\p{L}\p{N}_-]+/gu, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32),
    )
    .filter(Boolean);
  const unique = [...new Set(normalized)].slice(0, 4);

  return unique.length > 0 ? unique : fallback.slice(0, 4);
}

export function normalizeClassification(
  value: unknown,
  originalText: string,
  knownEntities: KnownEntity[],
): CaptureClassification {
  const input = asRecord(value);
  const parsedKind = captureKindSchema.safeParse(input.kind);
  const kind = parsedKind.success ? parsedKind.data : "note";
  const parsedUrgency = taskUrgencySchema.safeParse(input.urgency);
  const urgency =
    kind === "task" && parsedUrgency.success
      ? parsedUrgency.data
      : "someday";
  const parsedSphere = lifeSphereSchema.safeParse(input.sphere);
  const sphere =
    kind === "meal"
      ? "health"
      : parsedSphere.success
        ? parsedSphere.data
        : "personal";
  const title = groundedTitle(input.title, originalText);
  const summary =
    cleanText(input.summary, 280) || cleanText(originalText, 280) || title;
  const allowedEntityIds = new Set(knownEntities.map((entity) => entity.id));
  const entityId =
    typeof input.entity_id === "string" &&
    allowedEntityIds.has(input.entity_id)
      ? input.entity_id
      : null;
  const rawEstimate = input.time_estimate_min;
  const timeEstimate =
    kind === "task" &&
    typeof rawEstimate === "number" &&
    Number.isInteger(rawEstimate) &&
    rawEstimate >= 1 &&
    rawEstimate <= 1440
      ? rawEstimate
      : null;
  const eventStart =
    kind === "event" && isZonedIsoDate(input.event_start)
      ? input.event_start
      : null;
  const candidateEventEnd =
    kind === "event" && isZonedIsoDate(input.event_end)
      ? input.event_end
      : null;
  const eventEnd =
    eventStart &&
    candidateEventEnd &&
    Date.parse(candidateEventEnd) > Date.parse(eventStart)
      ? candidateEventEnd
      : null;

  return captureClassificationSchema.parse({
    kind,
    title,
    summary,
    urgency,
    sphere,
    key: input.key === true,
    tags: normalizeTags(input.tags, [kind, sphere]),
    entity_id: entityId,
    time_estimate_min: timeEstimate,
    event_start: eventStart,
    event_end: eventEnd,
  });
}

export function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace < 0 || lastBrace <= firstBrace) {
      throw new Error("Classifier did not return a JSON object");
    }

    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as unknown;
  }
}
