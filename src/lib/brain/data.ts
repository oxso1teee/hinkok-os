import "server-only";

import {
  BRAIN_SPHERES,
  isBrainSphere,
  type BrainSphere,
} from "@/lib/brain/config";
import {
  normalizeBrainNotes,
  normalizeCachedBriefing,
  type BrainBriefing,
  type BrainNote,
} from "@/lib/brain/normalize";
import { isObsidianConfigured } from "@/lib/env/obsidian";
import { serverEnv } from "@/lib/env/server";
import {
  normalizeStoredWeeklyInsight,
  type WeeklyInsight,
} from "@/lib/insights/normalize";
import { db } from "@/lib/supabase/admin";
import { getPersonalSettings } from "@/lib/settings/repository";
import type { Json } from "@/types/database";

export type BrainTask = {
  id: string;
  title: string;
  description: string | null;
  sphere: BrainSphere;
  category: string;
  urgency: string;
  key: boolean;
  priorityScore: number;
  timeEstimateMin: number | null;
  tags: string[];
  updatedAt: string;
};

export type BrainSphereStats = Record<BrainSphere, {
  taskCount: number;
  noteCount: number;
}>;

export type BrainDashboardData = {
  generatedAt: string;
  timeZone: string;
  dataStatus: "ready" | "partial";
  obsidianConfigured: boolean;
  tasks: BrainTask[];
  notes: BrainNote[];
  briefings: Partial<Record<BrainSphere, BrainBriefing>>;
  latestWeeklyInsight: WeeklyInsight | null;
  sphereInfo: Awaited<ReturnType<typeof getPersonalSettings>>["settings"]["sphereInfo"];
  sphereStats: BrainSphereStats;
  stats: {
    spheres: number;
    openTasks: number;
    notes: number;
    obsidianNotes: number;
  };
};

type MemoryRow = {
  id: string;
  source_type: string;
  source_key: string;
  chunk_index: number;
  text: string;
  metadata: Json;
  created_at: string;
};

function emptySphereStats(): BrainSphereStats {
  return Object.fromEntries(
    BRAIN_SPHERES.map((sphere) => [sphere, { taskCount: 0, noteCount: 0 }]),
  ) as BrainSphereStats;
}

function mapTasks(rows: Array<{
  id: string;
  title: string;
  description: string | null;
  sphere: string | null;
  category: string;
  urgency: string;
  key: boolean;
  priority_score: number;
  time_estimate_min: number | null;
  tags: string[];
  updated_at: string;
}>): BrainTask[] {
  return rows.flatMap((task) => {
    if (!task.sphere || !isBrainSphere(task.sphere)) return [];
    return [{
      id: task.id,
      title: task.title,
      description: task.description,
      sphere: task.sphere,
      category: task.category,
      urgency: task.urgency,
      key: task.key,
      priorityScore: task.priority_score,
      timeEstimateMin: task.time_estimate_min,
      tags: task.tags,
      updatedAt: task.updated_at,
    }];
  });
}

function briefingCacheKey(sphere: BrainSphere): string {
  return `brain:brief:${serverEnv.USER_ID}:${sphere}`;
}

export async function getBrainDashboardData(
  now = new Date(),
): Promise<BrainDashboardData> {
  const [tasksResult, memoryResult, statsResult, cacheResult, taskCountResult, insightResult, settingsResult] = await Promise.all([
    db()
      .from("tasks")
      .select("id, title, description, sphere, category, urgency, key, priority_score, time_estimate_min, tags, updated_at")
      .eq("user_id", serverEnv.USER_ID)
      .is("completed_at", null)
      .not("sphere", "is", null)
      .order("key", { ascending: false })
      .order("priority_score", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(300),
    db()
      .from("memory_chunks")
      .select("id, source_type, source_key, chunk_index, text, metadata, created_at")
      .eq("user_id", serverEnv.USER_ID)
      .order("created_at", { ascending: false })
      .order("chunk_index", { ascending: true })
      .limit(1_200),
    db().rpc("brain_sphere_stats", { p_user_id: serverEnv.USER_ID }),
    db()
      .from("kv_cache")
      .select("key, value")
      .in("key", BRAIN_SPHERES.map(briefingCacheKey)),
    db()
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", serverEnv.USER_ID)
      .is("completed_at", null),
    db()
      .from("weekly_insights")
      .select("id, week_start, week_end, summary, highlights, patterns, recommendations, metrics, provider, generated_at")
      .eq("user_id", serverEnv.USER_ID)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getPersonalSettings(),
  ]);

  const tasks = mapTasks(tasksResult.data ?? []);
  const notes = normalizeBrainNotes((memoryResult.data ?? []) as MemoryRow[]);
  const sphereStats = emptySphereStats();
  let obsidianNoteCount = 0;

  if (!statsResult.error) {
    for (const stat of statsResult.data ?? []) {
      if (!isBrainSphere(stat.sphere)) continue;
      sphereStats[stat.sphere] = {
        taskCount: Number(stat.open_task_count) || 0,
        noteCount: Number(stat.note_count) || 0,
      };
      obsidianNoteCount += Number(stat.obsidian_note_count) || 0;
    }
  } else {
    for (const task of tasks) sphereStats[task.sphere].taskCount += 1;
    for (const note of notes) sphereStats[note.sphere].noteCount += 1;
    obsidianNoteCount = new Set(
      notes.filter((note) => note.sourceType === "obsidian").map((note) => note.sourceKey),
    ).size;
  }

  const briefings: Partial<Record<BrainSphere, BrainBriefing>> = {};
  for (const item of cacheResult.data ?? []) {
    const briefing = normalizeCachedBriefing(item.value);
    if (briefing) briefings[briefing.sphere] = briefing;
  }

  return {
    generatedAt: now.toISOString(),
    timeZone: serverEnv.USER_TIMEZONE,
    dataStatus: tasksResult.error || memoryResult.error || statsResult.error || cacheResult.error || taskCountResult.error || insightResult.error || settingsResult.dataStatus === "unavailable"
      ? "partial"
      : "ready",
    obsidianConfigured: isObsidianConfigured(),
    tasks,
    notes,
    briefings,
    latestWeeklyInsight: normalizeStoredWeeklyInsight(insightResult.data),
    sphereInfo: settingsResult.settings.sphereInfo,
    sphereStats,
    stats: {
      spheres: BRAIN_SPHERES.length,
      openTasks: taskCountResult.count ?? Object.values(sphereStats).reduce((sum, stat) => sum + stat.taskCount, 0),
      notes: Object.values(sphereStats).reduce((sum, stat) => sum + stat.noteCount, 0),
      obsidianNotes: obsidianNoteCount,
    },
  };
}

export async function getBrainSphereContext(sphere: BrainSphere): Promise<{
  tasks: BrainTask[];
  notes: BrainNote[];
}> {
  const [tasksResult, memoryResult] = await Promise.all([
    db()
      .from("tasks")
      .select("id, title, description, sphere, category, urgency, key, priority_score, time_estimate_min, tags, updated_at")
      .eq("user_id", serverEnv.USER_ID)
      .eq("sphere", sphere)
      .is("completed_at", null)
      .order("key", { ascending: false })
      .order("priority_score", { ascending: false })
      .limit(20),
    db()
      .from("memory_chunks")
      .select("id, source_type, source_key, chunk_index, text, metadata, created_at")
      .eq("user_id", serverEnv.USER_ID)
      .contains("metadata", { sphere })
      .order("created_at", { ascending: false })
      .order("chunk_index", { ascending: true })
      .limit(300),
  ]);

  if (tasksResult.error || memoryResult.error) {
    throw new Error("Unable to read BRAIN sphere context", {
      cause: tasksResult.error ?? memoryResult.error,
    });
  }

  return {
    tasks: mapTasks(tasksResult.data ?? []),
    notes: normalizeBrainNotes((memoryResult.data ?? []) as MemoryRow[]).slice(0, 20),
  };
}

export async function storeBrainBriefing(briefing: BrainBriefing): Promise<void> {
  const { error } = await db().from("kv_cache").upsert({
    key: briefingCacheKey(briefing.sphere),
    value: briefing,
  });
  if (error) throw new Error("Unable to cache BRAIN briefing", { cause: error });
}
