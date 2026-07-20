import {
  DEFAULT_PERSONAL_SETTINGS,
  type PersonalSettings,
} from "@/lib/settings/normalize";

export type HabitDefinition = PersonalSettings["habits"][number];

export const HOME_HABITS: readonly HabitDefinition[] =
  DEFAULT_PERSONAL_SETTINGS.habits;

export const NUTRITION_TARGETS =
  DEFAULT_PERSONAL_SETTINGS.nutritionTargets;
