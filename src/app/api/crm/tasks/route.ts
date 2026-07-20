import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasSameOrigin } from "@/lib/auth/origin";
import { authenticateRequest } from "@/lib/auth/request";
import {
  createCrmTask,
  moveCrmTask,
  setCrmTaskCompletion,
  updateCrmTask,
  type CrmTaskInput,
} from "@/lib/crm/repository";
import { serverEnv } from "@/lib/env/server";
import { readBoundedJsonBody } from "@/lib/http/json-body";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 12_288;
const taskFields = {
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4_000).nullable(),
  urgency: z.enum([
    "today",
    "tomorrow",
    "this_week",
    "next_week",
    "this_month",
    "someday",
  ]),
  category: z.enum(["work", "content", "health", "finance", "personal"]),
  sphere: z
    .enum([
      "work",
      "finance",
      "health",
      "relationships",
      "growth",
      "mind",
      "personal",
      "content",
      "spirituality",
    ])
    .nullable(),
  key: z.boolean(),
  priorityScore: z.number().int().min(0).max(100),
  timeEstimateMin: z.number().int().min(1).max(1_440).nullable(),
  tags: z.array(z.string().trim().min(1).max(32)).max(8),
  entityId: z.uuid().nullable(),
};
const taskInputSchema = z.object(taskFields).strict();
const actionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      clientRequestId: z.uuid(),
      task: taskInputSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("update"),
      taskId: z.uuid(),
      task: taskInputSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("move"),
      taskId: z.uuid(),
      urgency: taskFields.urgency,
      beforeTaskId: z.uuid().nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal("completion"),
      taskId: z.uuid(),
      completed: z.boolean(),
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

function uniqueTags(input: CrmTaskInput): CrmTaskInput {
  return { ...input, tags: [...new Set(input.tags)] };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authentication = authenticateRequest(request);
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
      bucket: `crm:tasks:${serverEnv.USER_ID}:${authentication.method}`,
      windowSeconds: 300,
      maxRequests: 180,
    });
    if (!allowed) return response(429, { ok: false, error: "rate_limited" });

    const action = parsed.data;
    if (action.action === "create") {
      const taskId = await createCrmTask(
        action.clientRequestId,
        uniqueTags(action.task),
      );
      return response(200, { ok: true, taskId });
    }
    if (action.action === "update") {
      await updateCrmTask(action.taskId, uniqueTags(action.task));
    } else if (action.action === "move") {
      await moveCrmTask(action.taskId, action.urgency, action.beforeTaskId);
    } else {
      await setCrmTaskCompletion(action.taskId, action.completed);
    }

    return response(200, { ok: true });
  } catch (error: unknown) {
    console.error("CRM task action failed", error);
    return response(500, { ok: false, error: "internal_error" });
  }
}
