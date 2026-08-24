const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SIGNAL_TASK_SYNC_SECRET = "test-only-secret";
process.env.SIGNAL_SCRIPT_URL = "https://example.invalid/crm";

const handler = require("../api/signal");
const sessionHandler = require("../api/session");
const { createSessionToken } = require("../lib/signal-auth");

function request(method, body) {
  const token = createSessionToken({ owner: "Signed In User", role: "user" });
  return {
    method,
    body,
    headers: {
      cookie: `aldea_signal_session=${encodeURIComponent(token)}`,
      host: "signal.example",
      origin: "https://signal.example"
    }
  };
}

function response() {
  return {
    body: null,
    headers: {},
    statusCode: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return body;
    }
  };
}

test("allows a signed user to update a lead owned by someone else", async () => {
  const originalFetch = global.fetch;
  let forwardedBody;
  global.fetch = async (_url, options) => {
    forwardedBody = JSON.parse(options.body);
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
  };

  try {
    const res = response();
    await handler(request("POST", {
      action: "updateLeadDetails",
      leadName: "Lead owned by another user",
      stage: "2 - Contacted"
    }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(forwardedBody.leadName, "Lead owned by another user");
    assert.match(res.headers["Set-Cookie"], /Max-Age=28800/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("returns a safe unknown outcome when the CRM sends HTML with status 200", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => "<html>temporary upstream page</html>"
  });

  try {
    const res = response();
    await handler(request("POST", {
      action: "updateLeadDetails",
      leadName: "Test Lead"
    }), res);

    assert.equal(res.statusCode, 502);
    assert.equal(res.body.code, "UPSTREAM_INVALID_RESPONSE");
    assert.equal(res.body.unknownOutcome, true);
    assert.doesNotMatch(JSON.stringify(res.body), /temporary upstream page/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("rejects a missing session before calling the CRM", async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => {
    called = true;
  };

  try {
    const req = request("GET");
    req.headers.cookie = "";
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(called, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test("renews a valid session when the browser checks it", async () => {
  const req = request("GET");
  const res = response();
  await sessionHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.match(res.headers["Set-Cookie"], /HttpOnly/);
  assert.match(res.headers["Set-Cookie"], /Max-Age=28800/);
});
