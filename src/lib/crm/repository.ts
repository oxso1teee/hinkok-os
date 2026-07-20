import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import type {
  CrmCategory,
  CrmSphere,
  CrmUrgency,
} from "@/lib/crm/config";
import { serverEnv } from "@/lib/env/server";
import { db } from "@/lib/supabase/admin";

export type CrmTaskInput = {
  title: string;
  description: string | null;
  urgency: CrmUrgency;
  category: CrmCategory;
  sphere: CrmSphere | null;
  key: boolean;
  priorityScore: number;
  timeEstimateMin: number | null;
  tags: string[];
  entityId: string | null;
};

function taskArgs(input: CrmTaskInput) {
  return {
    p_title: input.title,
    p_description: input.description,
    p_urgency: input.urgency,
    p_category: input.category,
    p_sphere: input.sphere,
    p_key: input.key,
    p_priority_score: input.priorityScore,
    p_time_estimate_min: input.timeEstimateMin,
    p_tags: input.tags,
    p_entity_id: input.entityId,
  };
}

export async function createCrmTask(
  clientRequestId: string,
  input: CrmTaskInput,
): Promise<string> {
  const { data, error } = await db().rpc("create_crm_task", {
    p_user_id: serverEnv.USER_ID,
    p_client_request_id: clientRequestId,
    ...taskArgs(input),
  });

  if (error || typeof data !== "string") {
    throw new Error("Unable to create CRM task", { cause: error });
  }

  await recordAuditEvent({
    action: "crm.task_created",
    resourceType: "tasks",
    resourceId: data,
    metadata: { urgency: input.urgency, category: input.category },
  });

  return data;
}

export async function updateCrmTask(
  taskId: string,
  input: CrmTaskInput,
): Promise<void> {
  const { data, error } = await db().rpc("update_crm_task", {
    p_user_id: serverEnv.USER_ID,
    p_task_id: taskId,
    ...taskArgs(input),
  });

  if (error || data !== true) {
    throw new Error("Unable to update CRM task", { cause: error });
  }

  await recordAuditEvent({
    action: "crm.task_updated",
    resourceType: "tasks",
    resourceId: taskId,
    metadata: { urgency: input.urgency, category: input.category },
  });
}

export async function moveCrmTask(
  taskId: string,
  urgency: CrmUrgency,
  beforeTaskId: string | null,
): Promise<void> {
  const { data, error } = await db().rpc("move_crm_task", {
    p_user_id: serverEnv.USER_ID,
    p_task_id: taskId,
    p_urgency: urgency,
    p_before_task_id: beforeTaskId,
  });

  if (error || data !== true) {
    throw new Error("Unable to move CRM task", { cause: error });
  }

  await recordAuditEvent({
    action: "crm.task_moved",
    resourceType: "tasks",
    resourceId: taskId,
    metadata: { urgency, beforeTaskId },
  });
}

export async function setCrmTaskCompletion(
  taskId: string,
  completed: boolean,
): Promise<void> {
  const { data, error } = await db().rpc("set_task_completion", {
    p_user_id: serverEnv.USER_ID,
    p_task_id: taskId,
    p_completed: completed,
  });

  if (error || data !== true) {
    throw new Error("Unable to update CRM task completion", { cause: error });
  }

  await recordAuditEvent({
    action: "crm.task_completion_updated",
    resourceType: "tasks",
    resourceId: taskId,
    metadata: { completed },
  });
}
