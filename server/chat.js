import { chatSystemPrompt } from "./persona.js";
import { formatDuration } from "./format.js";
import { toChatMessages } from "./history.js";

export const FORCE_CALL_AT = 6;
export const CHAT_HISTORY_LIMIT = 30;
export const CHAT_TIMEOUT_MS = 18_000;
export const FALLBACK_REPLY = "Give me a second.";

const fallback = () => ({ reply: FALLBACK_REPLY, call: false, quickReplies: [], retryable: true });

export function countUserTurns(messages) {
  return (Array.isArray(messages) ? messages : []).filter(
    (m) => m?.role === "user" && (m.kind ?? "text") === "text",
  ).length;
}

export function stageNote(event, durationMs) {
  if (event === "call_ended") {
    return `[The video call just ended after ${formatDuration(durationMs)}. Text her first, picking up from the call.]`;
  }
  if (event === "call_dropped") return "[The video call cut out unexpectedly. Text her about it, in character.]";
  if (event === "call_declined") return "[She declined your video call. Text her, unbothered but noticing.]";
  return null;
}

export function parseModelOutput(raw) {
  const text = String(raw ?? "").trim();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!data || typeof data !== "object") {
    return text ? { reply: text, call: false, quickReplies: [] } : fallback();
  }
  const reply = typeof data.reply === "string" ? data.reply.trim() : "";
  if (!reply) return fallback();
  const quickReplies = Array.isArray(data.quick_replies)
    ? data.quick_replies
        .filter((q) => typeof q === "string" && q.trim())
        .map((q) => q.trim())
        .slice(0, 3)
    : [];
  return { reply, call: data.call === true, quickReplies };
}

export function decideCall({ modelWantsCall, userTurns, calledOnce, event }) {
  if (calledOnce || event) return false;
  return Boolean(modelWantsCall) || userTurns >= FORCE_CALL_AT;
}

function failureDetail(err) {
  const cause = err?.cause?.code || err?.cause?.message || "";
  return [err?.message, cause].filter(Boolean).join(" · ").slice(0, 180);
}

const CHIP_TIMEOUT_MS = 8_000;

function parseChips(raw) {
  let data = null;
  try {
    data = JSON.parse(String(raw ?? "").trim());
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const quickReplies = Array.isArray(data.quick_replies)
    ? data.quick_replies
        .filter((q) => typeof q === "string" && q.trim())
        .map((q) => q.trim())
        .slice(0, 3)
    : [];
  return { call: data.call === true, quickReplies };
}

async function requestCompletion({ body, apiKey, baseUrl, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`DeepSeek responded ${res.status} ${detail.slice(0, 120)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    if (!String(content).trim()) throw new Error("DeepSeek returned an empty reply");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateReply({
  messages,
  event = null,
  durationMs = 0,
  calledOnce = false,
  fetchImpl = fetch,
  env = process.env,
  timeoutMs = CHAT_TIMEOUT_MS,
}) {
  const apiKey = String(env.DEEPSEEK_API_KEY || "").trim();
  if (!apiKey) return fallback();

  const baseUrl = (env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const chat = toChatMessages(messages, CHAT_HISTORY_LIMIT);
  const note = stageNote(event, durationMs);
  if (note) chat.push({ role: "user", content: note });

  const model = env.DEEPSEEK_MODEL || "deepseek-chat";
  // JSON mode with this persona prompt returns whitespace on deepseek-flash.
  // Ask for the text itself, then a short follow-up for chips.
  const body = {
    model,
    messages: [{ role: "system", content: chatSystemPrompt() }, ...chat],
    thinking: { type: "disabled" },
    temperature: 1.1,
    max_tokens: 300,
  };

  let raw = null;
  let upstream = "";
  for (let attempt = 0; attempt < 2 && raw === null; attempt += 1) {
    try {
      raw = await requestCompletion({ body, apiKey, baseUrl, fetchImpl, timeoutMs });
    } catch (err) {
      upstream = failureDetail(err);
      console.warn("[chat] DeepSeek attempt failed:", upstream);
    }
  }
  if (raw === null) return { ...fallback(), upstream };

  const parsed = parseModelOutput(raw);
  if (parsed.retryable) return parsed;

  let modelWantsCall = parsed.call;
  let { quickReplies } = parsed;
  if (quickReplies.length === 0 && !String(raw).trim().startsWith("{")) {
    try {
      const chipRaw = await requestCompletion({
        body: {
          model,
          messages: [
            {
              role: "system",
              content:
                'Return json only: {"call":false,"quick_replies":["...","...","..."]}. The user message is his text to her. Set call to true only if he is asking her to pick up a video call right now. quick_replies are three things she might text back, in her voice, under 8 words each.',
            },
            { role: "user", content: parsed.reply },
          ],
          response_format: { type: "json_object" },
          thinking: { type: "disabled" },
          temperature: 0.4,
          max_tokens: 120,
        },
        apiKey,
        baseUrl,
        fetchImpl,
        timeoutMs: Math.min(timeoutMs, CHIP_TIMEOUT_MS),
      });
      const chips = parseChips(chipRaw);
      if (chips?.quickReplies.length) quickReplies = chips.quickReplies;
      if (chips?.call) modelWantsCall = true;
    } catch (err) {
      console.warn("[chat] chip follow-up failed:", failureDetail(err));
    }
  }

  return {
    reply: parsed.reply,
    quickReplies,
    call: decideCall({ modelWantsCall, userTurns: countUserTurns(messages), calledOnce, event }),
  };
}
