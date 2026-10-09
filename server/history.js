export const POPVID_HISTORY_LIMIT = 40;
const MAX_CONTENT_CHARS = 2000;

function textMessages(messages) {
  return (Array.isArray(messages) ? messages : []).filter(
    (m) =>
      m &&
      (m.kind ?? "text") === "text" &&
      (m.role === "user" || m.role === "him") &&
      typeof m.text === "string" &&
      m.text.trim(),
  );
}

export function toPopvidHistory(messages) {
  return textMessages(messages)
    .slice(-POPVID_HISTORY_LIMIT)
    .map((m) => ({
      role: m.role === "him" ? "character" : "user",
      content: m.text.trim().slice(0, MAX_CONTENT_CHARS),
    }));
}

export function toChatMessages(messages, limit = 30) {
  return textMessages(messages)
    .slice(-limit)
    .map((m) => ({
      role: m.role === "him" ? "assistant" : "user",
      content: m.text.trim().slice(0, MAX_CONTENT_CHARS),
    }));
}
