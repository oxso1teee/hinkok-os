import { z } from "zod";

export const CAPTURE_KINDS = [
  "task",
  "event",
  "note",
  "idea",
  "decision",
  "journal",
  "content",
  "person",
  "meal",
] as const;

export const TASK_URGENCIES = [
  "today",
  "tomorrow",
  "this_week",
  "next_week",
  "this_month",
  "someday",
] as const;

export const LIFE_SPHERES = [
  "work",
  "finance",
  "health",
  "relationships",
  "growth",
  "mind",
  "personal",
  "content",
  "spirituality",
] as const;

export const captureKindSchema = z.enum(CAPTURE_KINDS);
export const taskUrgencySchema = z.enum(TASK_URGENCIES);
export const lifeSphereSchema = z.enum(LIFE_SPHERES);

export const captureClassificationSchema = z
  .object({
    kind: captureKindSchema,
    title: z.string().trim().min(1).max(80),
    summary: z.string().trim().min(1).max(280),
    urgency: taskUrgencySchema,
    sphere: lifeSphereSchema,
    key: z.boolean(),
    tags: z.array(z.string().trim().min(1).max(32)).min(1).max(4),
    entity_id: z.uuid().nullable(),
    time_estimate_min: z.int().min(1).max(1440).nullable(),
    event_start: z.string().nullable(),
    event_end: z.string().nullable(),
  })
  .strict();

export const classifierModelOutputSchema = z
  .object({
    kind: captureKindSchema,
    title: z.string(),
    summary: z.string(),
    urgency: taskUrgencySchema,
    sphere: lifeSphereSchema,
    key: z.boolean(),
    tags: z.array(z.string()),
    entity_id: z.string().nullable(),
    time_estimate_min: z.int().nullable(),
    event_start: z.string().nullable(),
    event_end: z.string().nullable(),
  })
  .strict();

export type CaptureKind = z.infer<typeof captureKindSchema>;
export type TaskUrgency = z.infer<typeof taskUrgencySchema>;
export type LifeSphere = z.infer<typeof lifeSphereSchema>;
export type CaptureClassification = z.infer<
  typeof captureClassificationSchema
>;

export type KnownEntity = {
  id: string;
  name: string;
  kind: "person" | "org" | "project" | "topic";
};

export type ClassifierSource = "openai" | "regex";
