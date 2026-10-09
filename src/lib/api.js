const SEND_LIMIT = 60;
const OFFLINE_REPLY = { reply: "Give me a second.", call: false, quickReplies: [], retryable: true };

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function fetchPersona() {
  const res = await fetch("/api/persona");
  if (!res.ok) throw new Error(`persona ${res.status}`);
  return res.json();
}

export async function sendChat({ messages, calledOnce, event, durationMs }) {
  try {
    const { ok, data } = await post("/api/chat", {
      messages: messages.slice(-SEND_LIMIT),
      calledOnce,
      event,
      durationMs,
    });
    if (ok && typeof data.reply === "string") return data;
  } catch {
    /* network failure falls through */
  }
  return OFFLINE_REPLY;
}

export async function startCall(messages) {
  try {
    return await post("/api/call", { messages: messages.slice(-SEND_LIMIT) });
  } catch {
    return { ok: false, status: 0, data: { error: { code: "network" } } };
  }
}

export function heartbeatCall(sessionId) {
  if (!sessionId) return Promise.resolve();
  return fetch(`/api/calls/${sessionId}/heartbeat`, { method: "POST" }).catch(() => {});
}

export function endCall(sessionId) {
  if (!sessionId) return Promise.resolve();
  return fetch(`/api/calls/${sessionId}`, { method: "DELETE", keepalive: true }).catch(() => {});
}
