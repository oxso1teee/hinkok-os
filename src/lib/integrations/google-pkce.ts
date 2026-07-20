import { createHash, randomBytes } from "node:crypto";

const STATE_BYTES = 32;
const VERIFIER_BYTES = 64;

export type GooglePkceTransaction = {
  state: string;
  stateHash: string;
  verifier: string;
  challenge: string;
};

export function hashGoogleOAuthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("base64url");
}

export function googlePkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function createGooglePkceTransaction(): GooglePkceTransaction {
  const state = randomBytes(STATE_BYTES).toString("base64url");
  const verifier = randomBytes(VERIFIER_BYTES).toString("base64url");

  return {
    state,
    stateHash: hashGoogleOAuthState(state),
    verifier,
    challenge: googlePkceChallenge(verifier),
  };
}
