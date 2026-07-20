import "server-only";

import { serverEnv } from "@/lib/env/server";
import { db } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

type AuditEvent = {
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Json;
};

export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  const { error } = await db().from("audit_log").insert({
    user_id: serverEnv.USER_ID,
    action: event.action,
    resource_type: event.resourceType ?? null,
    resource_id: event.resourceId ?? null,
    metadata: event.metadata ?? {},
  });

  if (error) {
    throw new Error("Unable to record audit event", { cause: error });
  }
}
