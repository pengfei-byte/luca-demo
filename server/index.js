import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PERSONA } from "./persona.js";
import { generateReply } from "./chat.js";
import { CRISIS_REPLY, detectCrisis } from "./safety.js";
import { activeCalls, closeCall, createCall, renewLease, sweepCalls } from "./popvid.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 8787);
const MAX_MESSAGES = 60;
const CALL_EVENTS = new Set(["call_ended", "call_declined", "call_dropped"]);
const SESSION_ID = /^sess_[A-Za-z0-9]+$/;
const KINDS = new Set(["text", "call", "notice"]);

if (!process.env.POPVID_API_KEY) console.warn("Missing POPVID_API_KEY — video calls are disabled");
if (!process.env.DEEPSEEK_API_KEY) console.warn("Missing DEEPSEEK_API_KEY — Luca will only say the fallback line");

app.set("trust proxy", true);
app.use(cors({ origin: true }));
app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

function cleanMessages(raw) {
  return (Array.isArray(raw) ? raw : [])
    .slice(-MAX_MESSAGES)
    .filter((m) => m && (m.role === "user" || m.role === "him") && typeof m.text === "string")
    .map((m) => ({ role: m.role, text: m.text.slice(0, 2000), kind: KINDS.has(m.kind) ? m.kind : "text" }));
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    product: "luca",
    realtime: Boolean(process.env.POPVID_API_KEY),
    chat: Boolean(process.env.DEEPSEEK_API_KEY),
    sessions: activeCalls(),
  });
});

app.get("/api/persona", (_req, res) => {
  res.json(PERSONA);
});

app.post("/api/chat", async (req, res) => {
  const messages = cleanMessages(req.body?.messages);
  const event = CALL_EVENTS.has(req.body?.event) ? req.body.event : null;
  const last = messages.at(-1);
  if (!event && last?.role === "user" && detectCrisis(last.text)) {
    return res.json({ reply: CRISIS_REPLY, call: false, quickReplies: [], notice: true });
  }
  const result = await generateReply({
    messages,
    event,
    durationMs: Number(req.body?.durationMs) || 0,
    calledOnce: req.body?.calledOnce === true,
  });
  res.json(result);
});

app.post("/api/call", async (req, res) => {
  const result = await createCall({ messages: cleanMessages(req.body?.messages), req });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.status(201).json(result.data);
});

app.post("/api/calls/:id/heartbeat", (req, res) => {
  if (!renewLease(req.params.id)) return res.status(404).json({ ok: false });
  res.json({ ok: true });
});

app.delete("/api/calls/:id", async (req, res) => {
  if (SESSION_ID.test(req.params.id)) await closeCall(req.params.id);
  res.json({ ok: true });
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(__dirname, "..", "dist");
  app.use(express.static(dist));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Luca on http://0.0.0.0:${PORT}`);
  });
  setInterval(() => sweepCalls(), 5_000);
}
