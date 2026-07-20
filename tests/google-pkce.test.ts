import assert from "node:assert/strict";
import test from "node:test";

import {
  createGooglePkceTransaction,
  googlePkceChallenge,
  hashGoogleOAuthState,
} from "../src/lib/integrations/google-pkce";

test("creates independent high-entropy OAuth state and PKCE values", () => {
  const first = createGooglePkceTransaction();
  const second = createGooglePkceTransaction();

  assert.notEqual(first.state, second.state);
  assert.notEqual(first.verifier, second.verifier);
  assert.match(first.state, /^[A-Za-z0-9_-]{40,128}$/);
  assert.match(first.verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(first.stateHash, hashGoogleOAuthState(first.state));
  assert.equal(first.challenge, googlePkceChallenge(first.verifier));
});

test("matches the RFC 7636 S256 challenge example", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  assert.equal(
    googlePkceChallenge(verifier),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});
