import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import { serverEnv } from "@/lib/env/server";
import type { JournalMood } from "@/lib/journal/config";
import { indexMemory } from "@/lib/memory/indexing";
import { db } from "@/lib/supabase/admin";

export async function setJournalMood(
  date: string,
  mood: JournalMood,
): Promise<string> {
  const { data, error } = await db().rpc("set_journal_mood", {
    p_user_id: serverEnv.USER_ID,
    p_log_date: date,
    p_mood: mood,
  });
  if (error || typeof data !== "string") {
    throw new Error("Unable to save journal mood", { cause: error });
  }

  await recordAuditEvent({
    action: "journal.mood_updated",
    resourceType: "daily_logs",
    resourceId: data,
    metadata: { date, mood },
  });
  return data;
}

export async function saveJournalEntry(
  date: string,
  localTime: string,
  text: string,
): Promise<{ dailyLogId: string; memoryIndexed: boolean }> {
  const { data, error } = await db().rpc("save_journal_daily_entry", {
    p_user_id: serverEnv.USER_ID,
    p_log_date: date,
    p_local_time: localTime,
    p_text: text,
  });
  if (error || typeof data !== "string") {
    throw new Error("Unable to save journal entry", { cause: error });
  }

  await recordAuditEvent({
    action: "journal.entry_saved",
    resourceType: "daily_logs",
    resourceId: data,
    metadata: { date, characterCount: text.length },
  });

  let memoryIndexed = true;
  try {
    await indexMemory({
      sourceType: "journal",
      sourceId: data,
      sourceKey: `journal:daily:${date}`,
      text: `Journal entry ${date}\n\n${text}`,
      metadata: {
        date,
        kind: "journal",
        sphere: "mind",
        source: "web",
        title: `Дневник · ${date}`,
      },
    });
  } catch (error: unknown) {
    memoryIndexed = false;
    console.error("Journal memory indexing failed", error);
  }

  return { dailyLogId: data, memoryIndexed };
}
