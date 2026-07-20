import "server-only";

import {
  isCrmCategory,
  isCrmSphere,
  isCrmUrgency,
} from "@/lib/crm/config";
import type { CrmTask } from "@/lib/crm/normalize";
import { serverEnv } from "@/lib/env/server";
import { db } from "@/lib/supabase/admin";

export type CrmEntity = {
  id: string;
  name: string;
  kind: string;
};

export type CrmDashboardData = {
  generatedAt: string;
  timeZone: string;
  dataStatus: "ready" | "partial";
  tasks: CrmTask[];
  archivedTasks: CrmTask[];
  entities: CrmEntity[];
  stats: {
    people: number;
    openTasks: number;
    content: number;
    decisions: number;
    captures: number;
  };
};

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  urgency: string;
  category: string;
  sphere: string | null;
  key: boolean;
  priority_score: number;
  time_estimate_min: number | null;
  tags: string[];
  due_date: string | null;
  entity_id: string | null;
  completed_at: string | null;
  board_position: number;
  created_at: string;
  updated_at: string;
};

function mapTask(row: TaskRow, entityNames: Map<string, string>): CrmTask | null {
  if (!isCrmUrgency(row.urgency) || !isCrmCategory(row.category)) return null;
  if (row.sphere !== null && !isCrmSphere(row.sphere)) return null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    urgency: row.urgency,
    category: row.category,
    sphere: row.sphere,
    key: row.key,
    priorityScore: row.priority_score,
    timeEstimateMin: row.time_estimate_min,
    tags: row.tags,
    dueDate: row.due_date,
    entityId: row.entity_id,
    entityName: row.entity_id ? entityNames.get(row.entity_id) ?? null : null,
    completedAt: row.completed_at,
    boardPosition: row.board_position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getCrmDashboardData(
  now = new Date(),
): Promise<CrmDashboardData> {
  const taskSelection = [
    "id",
    "title",
    "description",
    "urgency",
    "category",
    "sphere",
    "key",
    "priority_score",
    "time_estimate_min",
    "tags",
    "due_date",
    "entity_id",
    "completed_at",
    "board_position",
    "created_at",
    "updated_at",
  ].join(", ");

  const [
    tasksResult,
    archiveResult,
    entitiesResult,
    peopleCountResult,
    taskCountResult,
    contentCountResult,
    decisionCountResult,
    captureCountResult,
  ] = await Promise.all([
    db()
      .from("tasks")
      .select(taskSelection)
      .eq("user_id", serverEnv.USER_ID)
      .is("completed_at", null)
      .order("board_position", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(500),
    db()
      .from("tasks")
      .select(taskSelection)
      .eq("user_id", serverEnv.USER_ID)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(100),
    db()
      .from("entities")
      .select("id, name, kind")
      .eq("user_id", serverEnv.USER_ID)
      .order("name", { ascending: true })
      .limit(200),
    db()
      .from("entities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", serverEnv.USER_ID)
      .eq("kind", "person"),
    db()
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", serverEnv.USER_ID)
      .is("completed_at", null),
    db()
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", serverEnv.USER_ID)
      .eq("category", "content")
      .is("completed_at", null),
    db()
      .from("raw_captures")
      .select("id", { count: "exact", head: true })
      .eq("user_id", serverEnv.USER_ID)
      .eq("classification->>kind", "decision"),
    db()
      .from("raw_captures")
      .select("id", { count: "exact", head: true })
      .eq("user_id", serverEnv.USER_ID),
  ]);

  const entityNames = new Map(
    (entitiesResult.data ?? []).map((entity) => [entity.id, entity.name]),
  );
  const mapRows = (rows: unknown): CrmTask[] =>
    ((rows ?? []) as TaskRow[])
      .map((row) => mapTask(row, entityNames))
      .filter((task): task is CrmTask => task !== null);
  const hasError = Boolean(
    tasksResult.error ||
      archiveResult.error ||
      entitiesResult.error ||
      peopleCountResult.error ||
      taskCountResult.error ||
      contentCountResult.error ||
      decisionCountResult.error ||
      captureCountResult.error,
  );

  return {
    generatedAt: now.toISOString(),
    timeZone: serverEnv.USER_TIMEZONE,
    dataStatus: hasError ? "partial" : "ready",
    tasks: mapRows(tasksResult.data),
    archivedTasks: mapRows(archiveResult.data),
    entities: entitiesResult.data ?? [],
    stats: {
      people: peopleCountResult.count ?? 0,
      openTasks: taskCountResult.count ?? 0,
      content: contentCountResult.count ?? 0,
      decisions: decisionCountResult.count ?? 0,
      captures: captureCountResult.count ?? 0,
    },
  };
}
