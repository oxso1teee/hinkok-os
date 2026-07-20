import "server-only";

import { serverEnv } from "@/lib/env/server";
import { db } from "@/lib/supabase/admin";
import type { KnownEntity } from "@/lib/capture/schema";

export async function listKnownEntities(): Promise<KnownEntity[]> {
  const { data, error } = await db()
    .from("entities")
    .select("id, name, kind")
    .eq("user_id", serverEnv.USER_ID)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error("Unable to read known entities", { cause: error });
  }

  return (data ?? []).map((entity) => ({
    id: entity.id,
    name: entity.name.replace(/\s+/g, " ").trim().slice(0, 160),
    kind: entity.kind as KnownEntity["kind"],
  }));
}
