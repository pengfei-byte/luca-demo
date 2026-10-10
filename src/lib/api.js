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

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

export function fetchRelationship() {
  return getJson("/api/relationship");
}

export function fetchProfile() {
  return getJson("/api/luca/profile");
}

export async function openChapter(chapterId) {
  const { ok, status, data } = await post("/api/story/open", { chapterId });
  if (!ok) throw new Error(data.error || status);
  return data;
}

export async function patchPreferences(patch) {
  const res = await fetch("/api/relationship/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("preferences");
  return res.json();
}

export async function defineRelationship(definition) {
  const { ok, data } = await post("/api/relationship/definition", { definition });
  if (!ok) throw new Error(data.error || "definition");
  return data;
}

export async function forgetMemory(memoryId) {
  const res = await fetch(`/api/relationship/memories/${encodeURIComponent(memoryId)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("memory");
  return res.json();
}

export async function resetRelationship() {
  const { ok, data } = await post("/api/relationship/reset", { confirm: true });
  if (!ok) throw new Error("reset");
  return data;
}

export function declineInvite() {
  return post("/api/relationship/decline", {}).catch(() => {});
}

export async function authorizeLine(body) {
  try {
    const { ok, data } = await post("/api/call/line", body);
    if (!ok || !data?.line) return { blocked: true, line: "" };
    return data;
  } catch {
    return { blocked: true, line: "" };
  }
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
