export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-hinkok_session"
    : "hinkok_session";

export const SESSION_VERSION = 1;
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const SESSION_CLOCK_SKEW_SECONDS = 5 * 60;
export const MAX_SESSION_COOKIE_LENGTH = 2048;

export const LOGIN_WINDOW_MINUTES = 15;
export const LOGIN_MAX_FAILURES = 8;
export const LOGIN_MIN_RESPONSE_MS = 900;
export const LOGIN_MAX_BODY_BYTES = 4096;
