import "server-only";

import type { NextRequest } from "next/server";

import { constantTimeStringEqual } from "@/lib/auth/constant-time";
import {
  SESSION_COOKIE_NAME,
  type SessionPayload,
  verifySessionToken,
} from "@/lib/auth/session";
import { serverEnv } from "@/lib/env/server";

export type RequestAuthentication =
  | {
      authenticated: true;
      method: "session";
      session: SessionPayload;
    }
  | {
      authenticated: true;
      method: "api-secret";
      session: null;
    }
  | {
      authenticated: false;
      method: null;
      session: null;
    };

export function authenticateRequest(
  request: NextRequest,
): RequestAuthentication {
  const apiSecret = request.headers.get("x-api-secret");

  if (
    apiSecret &&
    apiSecret.length <= 512 &&
    constantTimeStringEqual(apiSecret, serverEnv.API_SECRET)
  ) {
    return {
      authenticated: true,
      method: "api-secret",
      session: null,
    };
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(sessionToken);

  if (session) {
    return {
      authenticated: true,
      method: "session",
      session,
    };
  }

  return {
    authenticated: false,
    method: null,
    session: null,
  };
}
