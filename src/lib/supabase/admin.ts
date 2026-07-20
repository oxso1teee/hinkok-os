import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env/server";
import type { Database } from "@/types/database";

let adminClient: SupabaseClient<Database> | null = null;

export function db(): SupabaseClient<Database> {
  if (adminClient) {
    return adminClient;
  }

  adminClient = createClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      db: { schema: "public" },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { "X-Client-Info": "hinkok-os-server/0.1.0" },
      },
    },
  );

  return adminClient;
}
