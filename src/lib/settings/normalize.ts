import { z } from "zod";

import {
  BRAIN_SPHERES,
  BRAIN_SPHERE_INFO,
  type BrainSphere,
} from "@/lib/brain/config";
import { DEFAULT_OBSIDIAN_FOLDER_MAPPING } from "@/lib/obsidian/mapping";
import type { Json } from "@/types/database";

const compactString = (minimum: number, maximum: number) =>
  z.string().transform((value) => value.replace(/\s+/g, " ").trim()).pipe(
    z.string().min(minimum).max(maximum),
  );

const sphereSchema = z.enum(BRAIN_SPHERES);

export const habitDefinitionSchema = z
  .object({
    id: z.string().trim().regex(/^[a-z0-9_]{1,32}$/),
    label: compactString(1, 40),
    eyebrow: compactString(1, 24),
    target: z.number().int().min(1).max(10),
  })
  .strict();

export const nutritionTargetsSchema = z
  .object({
    kcal: z.number().int().min(500).max(10_000),
    protein: z.number().int().min(0).max(1_000),
    carbs: z.number().int().min(0).max(1_000),
    fat: z.number().int().min(0).max(1_000),
  })
  .strict();

const sphereInfoItemSchema = z
  .object({
    label: compactString(1, 32),
    description: compactString(1, 180),
  })
  .strict();

export const sphereInfoSchema = z.object({
  work: sphereInfoItemSchema,
  finance: sphereInfoItemSchema,
  health: sphereInfoItemSchema,
  relationships: sphereInfoItemSchema,
  growth: sphereInfoItemSchema,
  mind: sphereInfoItemSchema,
  personal: sphereInfoItemSchema,
  content: sphereInfoItemSchema,
  spirituality: sphereInfoItemSchema,
}).strict();

export const obsidianFolderMappingSchema = z
  .record(z.string(), sphereSchema)
  .superRefine((mapping, context) => {
    const entries = Object.entries(mapping);
    if (entries.length > 100) {
      context.addIssue({ code: "custom", message: "Too many folder mappings" });
    }
    for (const [folder] of entries) {
      const normalized = folder.normalize("NFC").toLocaleLowerCase("ru-RU").trim();
      if (
        normalized.length < 1 ||
        normalized.length > 80 ||
        normalized !== folder ||
        folder.includes("/") ||
        folder.includes("\\") ||
        folder.includes("\0") ||
        folder === "." ||
        folder === ".."
      ) {
        context.addIssue({ code: "custom", message: "Invalid folder mapping key" });
      }
    }
  });

export const personalSettingsSchema = z
  .object({
    displayName: compactString(1, 60),
    focusStatement: compactString(1, 120),
    habits: z.array(habitDefinitionSchema).min(1).max(12),
    nutritionTargets: nutritionTargetsSchema,
    sphereInfo: sphereInfoSchema,
    obsidianFolderMapping: obsidianFolderMappingSchema,
  })
  .strict()
  .superRefine((settings, context) => {
    const ids = new Set<string>();
    for (const habit of settings.habits) {
      if (ids.has(habit.id)) {
        context.addIssue({ code: "custom", message: "Duplicate habit id" });
      }
      ids.add(habit.id);
    }
  });

export type PersonalSettings = z.infer<typeof personalSettingsSchema>;

export const DEFAULT_PERSONAL_SETTINGS: PersonalSettings = {
  displayName: "HinkoK",
  focusStatement: "Выполнить ключевое",
  habits: [
    { id: "sport", label: "Спорт", eyebrow: "move", target: 1 },
    { id: "supplements", label: "Добавки", eyebrow: "health", target: 2 },
    { id: "meditation", label: "Медитация", eyebrow: "mind", target: 1 },
    { id: "publish", label: "Публикация", eyebrow: "content", target: 1 },
    { id: "day_walk", label: "Прогулка", eyebrow: "body", target: 1 },
    { id: "journal", label: "Дневник", eyebrow: "reflect", target: 1 },
  ],
  nutritionTargets: { kcal: 2_400, protein: 160, carbs: 260, fat: 75 },
  sphereInfo: structuredClone(BRAIN_SPHERE_INFO),
  obsidianFolderMapping: { ...DEFAULT_OBSIDIAN_FOLDER_MAPPING },
};

export type PersonalSettingsRow = {
  display_name?: unknown;
  focus_statement?: unknown;
  habits?: unknown;
  nutrition_targets?: unknown;
  sphere_info?: unknown;
  obsidian_folder_mapping?: unknown;
};

function fallbackSettings(): PersonalSettings {
  return structuredClone(DEFAULT_PERSONAL_SETTINGS);
}

export function normalizePersonalSettings(
  value: PersonalSettingsRow | null | undefined,
): PersonalSettings {
  if (!value) return fallbackSettings();
  const parsed = personalSettingsSchema.safeParse({
    displayName: value.display_name,
    focusStatement: value.focus_statement,
    habits: value.habits,
    nutritionTargets: value.nutrition_targets,
    sphereInfo: value.sphere_info,
    obsidianFolderMapping: value.obsidian_folder_mapping,
  });
  return parsed.success ? parsed.data : fallbackSettings();
}

export function settingsDatabaseValues(settings: PersonalSettings): {
  display_name: string;
  focus_statement: string;
  habits: Json;
  nutrition_targets: Json;
  sphere_info: Json;
  obsidian_folder_mapping: Json;
} {
  return {
    display_name: settings.displayName,
    focus_statement: settings.focusStatement,
    habits: settings.habits as unknown as Json,
    nutrition_targets: settings.nutritionTargets as unknown as Json,
    sphere_info: settings.sphereInfo as unknown as Json,
    obsidian_folder_mapping: settings.obsidianFolderMapping as Json,
  };
}

export function normalizeFolderName(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("ru-RU").trim();
}

export function sphereInfoFor(
  settings: PersonalSettings,
  sphere: BrainSphere,
): PersonalSettings["sphereInfo"][BrainSphere] {
  return settings.sphereInfo[sphere];
}
