import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import { serverEnv } from "@/lib/env/server";
import { db } from "@/lib/supabase/admin";

export async function setHomeTaskCompletion(
  taskId: string,
  completed: boolean,
): Promise<void> {
  const { data, error } = await db().rpc("set_task_completion", {
    p_user_id: serverEnv.USER_ID,
    p_task_id: taskId,
    p_completed: completed,
  });

  if (error || data !== true) {
    throw new Error("Unable to update task completion", { cause: error });
  }

  await recordAuditEvent({
    action: "home.task_completion_updated",
    resourceType: "tasks",
    resourceId: taskId,
    metadata: { completed },
  });
}

export async function setHomeHabit(
  date: string,
  habitId: string,
  value: number,
): Promise<void> {
  const { data, error } = await db().rpc("set_daily_habit", {
    p_user_id: serverEnv.USER_ID,
    p_log_date: date,
    p_habit_id: habitId,
    p_value: value,
  });

  if (error || typeof data !== "string") {
    throw new Error("Unable to update daily habit", { cause: error });
  }

  await recordAuditEvent({
    action: "home.habit_updated",
    resourceType: "daily_logs",
    resourceId: data,
    metadata: { date, habitId, value },
  });
}

export async function addHomeGoal(
  date: string,
  period: "week" | "month",
  text: string,
): Promise<void> {
  const { data, error } = await db().rpc("add_daily_goal", {
    p_user_id: serverEnv.USER_ID,
    p_log_date: date,
    p_period: period,
    p_text: text,
  });

  if (error || !data) {
    throw new Error("Unable to add daily goal", { cause: error });
  }

  await recordAuditEvent({
    action: "home.goal_added",
    resourceType: "daily_logs",
    metadata: { date, period },
  });
}

export async function setHomeGoalCompleted(
  date: string,
  period: "week" | "month",
  goalId: string,
  done: boolean,
): Promise<void> {
  const { data, error } = await db().rpc("set_daily_goal_completed", {
    p_user_id: serverEnv.USER_ID,
    p_log_date: date,
    p_period: period,
    p_goal_id: goalId,
    p_done: done,
  });

  if (error || data !== true) {
    throw new Error("Unable to update daily goal", { cause: error });
  }

  await recordAuditEvent({
    action: "home.goal_completion_updated",
    resourceType: "daily_logs",
    metadata: { date, period, goalId, done },
  });
}
