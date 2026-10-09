import { detectCrisis } from "./safety.js";

export const MAX_MESSAGES = 60;
const KINDS = new Set(["text", "call", "notice"]);

function isUserText(message) {
  if (!message || message.role !== "user" || typeof message.text !== "string") return false;
  const kind = KINDS.has(message.kind) ? message.kind : "text";
  return kind === "text";
}

export function sanitizeMessages(raw) {
  const input = Array.isArray(raw) ? raw : [];
  const last = input.at(-1);
  const lastUserInCrisis = isUserText(last) && detectCrisis(last.text);
  const messages = input
    .slice(-MAX_MESSAGES)
    .filter((m) => m && (m.role === "user" || m.role === "him") && typeof m.text === "string")
    .map((m) => {
      const text = m.text.slice(0, 2000);
      const kind = KINDS.has(m.kind) ? m.kind : "text";
      if (m.role === "user" && kind === "text" && detectCrisis(m.text)) {
        return { role: m.role, text, kind: "notice" };
      }
      return { role: m.role, text, kind };
    });
  return { messages, lastUserInCrisis };
}
