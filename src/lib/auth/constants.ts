export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-hinkok_session"
    : "hinkok_session";

// Bumped from 1 to 2 for the sessionId field (P0-AUTH-03 session list/revocation).
export const SESSION_VERSION = 2;
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const SESSION_CLOCK_SKEW_SECONDS = 5 * 60;
export const MAX_SESSION_COOKIE_LENGTH = 2048;

export const LOGIN_WINDOW_MINUTES = 15;
export const LOGIN_MAX_FAILURES = 8;
export const LOGIN_MIN_RESPONSE_MS = 900;
export const LOGIN_MAX_BODY_BYTES = 4096;

// Account-wide (not per-ip) lockout: closes the ip-rotation bypass of the
// per-ip gate above. Deliberately higher than LOGIN_MAX_FAILURES since it
// aggregates every ip, including the owner's own occasional retries.
export const LOGIN_GLOBAL_MAX_FAILURES = 20;
export const LOGIN_GLOBAL_WINDOW_SECONDS = LOGIN_WINDOW_MINUTES * 60;

// Exponential backoff added on top of LOGIN_MIN_RESPONSE_MS, scaling with the
// account-wide failure count in the current window.
export const LOGIN_BACKOFF_BASE_MS = 250;
export const LOGIN_BACKOFF_MAX_MS = 8_000;

// Alert the owner over Telegram once per multiple of this many consecutive
// account-wide failures (5, 10, 15, ...), not on every blocked request.
export const LOGIN_ALERT_EVERY_N_FAILURES = 5;
