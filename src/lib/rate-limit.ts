import "server-only";

import { db } from "@/lib/supabase/admin";

type RateLimitOptions = {
  bucket: string;
  windowSeconds: number;
  maxRequests: number;
};

export async function consumeRateLimit(
  options: RateLimitOptions,
): Promise<boolean> {
  const { data, error } = await db().rpc("consume_rate_limit", {
    p_bucket: options.bucket,
    p_window_seconds: options.windowSeconds,
    p_max_requests: options.maxRequests,
  });

  if (error) {
    throw new Error("Unable to consume rate limit", { cause: error });
  }

  return data === true;
}
