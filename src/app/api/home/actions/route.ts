import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import { localCaptureTime } from "@/lib/capture/time";
import { serverEnv } from "@/lib/env/server";
import {
  addHomeGoal,
  setHomeGoalCompleted,
  setHomeHabit,
  setHomeTaskCompletion,
} from "@/lib/home/repository";
import { readBoundedJsonBody } from "@/lib/http/json-body";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getPersonalSettings } from "@/lib/settings/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_096;
const actionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("task_completion"),
      taskId: z.uuid(),
      completed: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("habit_completion"),
      habitId: z.string().trim().min(1).max(64),
      completed: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("goal_add"),
      period: z.enum(["week", "month"]),
      text: z.string().trim().min(1).max(200),
    })
    .strict(),
  z
    .object({
      action: z.literal("goal_completion"),
      period: z.enum(["week", "month"]),
      goalId: z.uuid(),
      done: z.boolean(),
    })
    .strict(),
]);

function response(status: number, body: Record<string, unknown>): NextResponse {
  const result = NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

  if (status === 429) result.headers.set("Retry-After", "300");
  return result;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authentication = await authenticateRequest(request);

  if (!authentication.authenticated) {
    return response(401, { ok: false, error: "unauthorized" });
  }

  if (authentication.method === "session" && !hasSameOrigin(request)) {
    return response(403, { ok: false, error: "invalid_request" });
  }

  try {
    const body = await readBoundedJsonBody(request, MAX_BODY_BYTES);
    if (!body.ok) return response(400, { ok: false, error: "invalid_request" });

    const parsed = actionSchema.safeParse(body.value);
    if (!parsed.success) return response(400, { ok: false, error: "invalid_request" });

    const allowed = await consumeRateLimit({
      bucket: `home:actions:${serverEnv.USER_ID}:${authentication.method}`,
      windowSeconds: 300,
      maxRequests: 120,
    });
    if (!allowed) return response(429, { ok: false, error: "rate_limited" });

    const today = localCaptureTime(new Date(), serverEnv.USER_TIMEZONE).date;
    const action = parsed.data;

    if (action.action === "task_completion") {
      await setHomeTaskCompletion(action.taskId, action.completed);
    } else if (action.action === "habit_completion") {
      const { settings } = await getPersonalSettings();
      const habit = settings.habits.find((item) => item.id === action.habitId);
      if (!habit) return response(400, { ok: false, error: "invalid_request" });
      await setHomeHabit(today, habit.id, action.completed ? habit.target : 0);
    } else if (action.action === "goal_add") {
      await addHomeGoal(today, action.period, action.text);
    } else {
      await setHomeGoalCompleted(
        today,
        action.period,
        action.goalId,
        action.done,
      );
    }

    return response(200, { ok: true });
  } catch (error: unknown) {
    console.error("HOME action failed", error);
    return response(503, { ok: false, error: "unavailable" });
  }
}
