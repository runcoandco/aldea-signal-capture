const test = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");

process.env.SIGNAL_TASK_SYNC_SECRET = "test-only-secret";
const {
  createSessionToken,
  SESSION_TTL_SECONDS,
  verifyLaunchToken,
  verifySessionToken
} = require("../lib/signal-auth");

function launchToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", process.env.SIGNAL_TASK_SYNC_SECRET)
    .update(`launch:${encoded}`)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

test("accepts a valid short-lived launch", () => {
  const now = Date.now();
  const token = launchToken({ owner: "Test User", role: "user", exp: now + 60_000, nonce: "one" });
  assert.deepEqual(verifyLaunchToken(token, now), { owner: "Test User", role: "user" });
});

test("rejects tampered and expired launches", () => {
  const now = Date.now();
  const valid = launchToken({ owner: "Test User", role: "admin", exp: now + 60_000, nonce: "two" });
  assert.equal(verifyLaunchToken(`${valid}x`, now), null);
  assert.equal(verifyLaunchToken(launchToken({ owner: "Test User", role: "user", exp: now - 1, nonce: "three" }), now), null);
});

test("creates and verifies a bounded session", () => {
  const now = Date.now();
  const token = createSessionToken({ owner: "Test User", role: "admin" }, now);
  assert.deepEqual(verifySessionToken(token, now), { owner: "Test User", role: "admin" });
  assert.equal(verifySessionToken(token, now + SESSION_TTL_SECONDS * 1000 + 1), null);
});

test("keeps a signed session within one working day", () => {
  assert.equal(SESSION_TTL_SECONDS, 8 * 60 * 60);
});
