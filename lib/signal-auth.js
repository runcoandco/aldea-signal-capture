const { createHmac, timingSafeEqual } = require("node:crypto");

const COOKIE_NAME = "aldea_signal_session";
const SESSION_TTL_SECONDS = 60 * 60;
const MAX_LAUNCH_TTL_MS = 2 * 60 * 1000;

function secret() {
  const value = process.env.SIGNAL_TASK_SYNC_SECRET;
  if (!value) throw new Error("Missing SIGNAL_TASK_SYNC_SECRET");
  return value;
}

function signature(scope, payload) {
  return createHmac("sha256", secret())
    .update(`${scope}:${payload}`)
    .digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function readToken(token, scope) {
  if (typeof token !== "string") return null;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  if (!safeEqual(signature(scope, payload), suppliedSignature)) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function validIdentity(value) {
  return value && typeof value.owner === "string" && value.owner.trim() !== "" &&
    (value.role === "admin" || value.role === "user");
}

function verifyLaunchToken(token, now = Date.now()) {
  const payload = readToken(token, "launch");
  if (!validIdentity(payload) || typeof payload.nonce !== "string") return null;
  if (!Number.isFinite(payload.exp) || payload.exp <= now || payload.exp > now + MAX_LAUNCH_TTL_MS) return null;
  return { owner: payload.owner.trim(), role: payload.role };
}

function createSessionToken(identity, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    owner: identity.owner,
    role: identity.role,
    exp: now + SESSION_TTL_SECONDS * 1000
  })).toString("base64url");
  return `${payload}.${signature("session", payload)}`;
}

function verifySessionToken(token, now = Date.now()) {
  const payload = readToken(token, "session");
  if (!validIdentity(payload) || !Number.isFinite(payload.exp) || payload.exp <= now) return null;
  return { owner: payload.owner.trim(), role: payload.role };
}

function cookieValue(request) {
  const cookies = String(request.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const [name, ...parts] = cookie.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(parts.join("="));
  }
  return null;
}

function sessionFromRequest(request) {
  return verifySessionToken(cookieValue(request));
}

function setSessionCookie(response, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure}`);
}

function clearSessionCookie(response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

function isSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const host = request.headers["x-forwarded-host"] || request.headers.host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

module.exports = {
  clearSessionCookie,
  createSessionToken,
  isSameOrigin,
  sessionFromRequest,
  setSessionCookie,
  verifyLaunchToken,
  verifySessionToken
};
