const DEFAULT_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzSJk_4tzxMFXJeJ5LZUxgbcGOcYfdHFb6CQCJvhfaP164KZTXcDVyU54UaIQii8BKr5w/exec";
const DEFAULT_TASK_MANAGER_URL =
  "https://aldea-task-manager.vercel.app/api/sync/signal-task";

async function readJsonResponse(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response (${response.status})`);
  }
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const scriptUrl = process.env.SIGNAL_SCRIPT_URL || DEFAULT_SCRIPT_URL;

    if (!body || typeof body !== "object") {
      return response.status(400).json({ success: false, error: "Invalid request body" });
    }

    const crmResponse = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow"
    });
    const crmResult = await readJsonResponse(crmResponse);

    if (!crmResponse.ok || !crmResult.success) {
      return response.status(502).json({
        success: false,
        error: crmResult.error || "CRM save failed"
      });
    }

    if (body.action !== "logSignal") {
      return response.status(200).json(crmResult);
    }

    const hasTaskSyncFields = [body.nextAction, body.nextActionDate, body.nextActionOwner]
      .every((value) => typeof value === "string" && value.trim() !== "");

    if (!hasTaskSyncFields) {
      return response.status(200).json(crmResult);
    }

    const syncSecret = process.env.SIGNAL_TASK_SYNC_SECRET;
    if (!syncSecret) {
      return response.status(200).json({
        ...crmResult,
        warning: "CRM saved, but Task Manager sync is not configured.",
        taskSync: { success: false, error: "Missing SIGNAL_TASK_SYNC_SECRET" }
      });
    }

    try {
      const taskResponse = await fetch(
        process.env.TASK_MANAGER_SYNC_URL || DEFAULT_TASK_MANAGER_URL,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${syncSecret}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        }
      );
      const taskResult = await readJsonResponse(taskResponse);

      if (!taskResponse.ok || !taskResult.success) {
        return response.status(200).json({
          ...crmResult,
          warning: `CRM saved, but Task Manager sync failed: ${taskResult.error || "Unknown error"}`,
          taskSync: taskResult
        });
      }

      return response.status(200).json({
        ...crmResult,
        taskSync: taskResult
      });
    } catch (error) {
      return response.status(200).json({
        ...crmResult,
        warning: `CRM saved, but Task Manager sync failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        taskSync: { success: false }
      });
    }
  } catch (error) {
    return response.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Signal save failed"
    });
  }
}
