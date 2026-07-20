import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import type { Json } from "@/types/database";

export async function recordAuthAudit(
  action: "auth.login.success" | "auth.logout" | "auth.password_recovered",
  metadata: Json,
): Promise<void> {
  await recordAuditEvent({
    action,
    resourceType: "session",
    metadata,
  });
}
