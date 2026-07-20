import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import { serverEnv } from "@/lib/env/server";
import {
  normalizePersonalSettings,
  settingsDatabaseValues,
  type PersonalSettings,
} from "@/lib/settings/normalize";
import { db } from "@/lib/supabase/admin";

export type PersonalSettingsResult = {
  settings: PersonalSettings;
  dataStatus: "ready" | "unavailable";
};

export async function getPersonalSettings(): Promise<PersonalSettingsResult> {
  const result = await db()
    .from("personal_settings")
    .select(
      "display_name, focus_statement, habits, nutrition_targets, sphere_info, obsidian_folder_mapping",
    )
    .eq("user_id", serverEnv.USER_ID)
    .maybeSingle();

  return {
    settings: normalizePersonalSettings(result.data),
    dataStatus: result.error ? "unavailable" : "ready",
  };
}

export async function savePersonalSettings(
  settings: PersonalSettings,
): Promise<void> {
  const { error } = await db().from("personal_settings").upsert(
    {
      user_id: serverEnv.USER_ID,
      ...settingsDatabaseValues(settings),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    throw new Error("Unable to save personal settings", { cause: error });
  }

  await recordAuditEvent({
    action: "settings.updated",
    resourceType: "personal_settings",
    metadata: {
      habitCount: settings.habits.length,
      folderMappingCount: Object.keys(settings.obsidianFolderMapping).length,
    },
  });
}
