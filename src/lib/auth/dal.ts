import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth/session";
import { isSessionRevoked, touchSessionLastSeen } from "@/lib/auth/sessions";

export const requireSession = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);

  if (!session || (await isSessionRevoked(session.sessionId))) {
    redirect("/login");
  }

  touchSessionLastSeen(session.sessionId);

  return session;
});
