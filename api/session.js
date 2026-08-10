const {
  clearSessionCookie,
  createSessionToken,
  isSameOrigin,
  sessionFromRequest,
  setSessionCookie,
  verifyLaunchToken
} = require("../lib/signal-auth");

function bodyOf(request) {
  return typeof request.body === "string" ? JSON.parse(request.body) : request.body;
}

module.exports = async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");

  try {
    if (request.method === "GET") {
      const session = sessionFromRequest(request);
      return session
        ? response.status(200).json({ success: true, ...session })
        : response.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (request.method === "POST") {
      if (!isSameOrigin(request)) return response.status(403).json({ success: false, error: "Invalid origin" });
      const identity = verifyLaunchToken(bodyOf(request)?.token);
      if (!identity) return response.status(401).json({ success: false, error: "Invalid or expired launch" });
      setSessionCookie(response, createSessionToken(identity));
      return response.status(200).json({ success: true, ...identity });
    }

    if (request.method === "DELETE") {
      if (!isSameOrigin(request)) return response.status(403).json({ success: false, error: "Invalid origin" });
      clearSessionCookie(response);
      return response.status(200).json({ success: true });
    }

    return response.status(405).json({ success: false, error: "Method not allowed" });
  } catch {
    return response.status(500).json({ success: false, error: "Session request failed" });
  }
};
