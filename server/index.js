import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PERSONA } from "./persona.js";
import { activeCalls, closeCall, renewLease, sweepCalls } from "./popvid.js";
import { attachLuca } from "./luca-api.js";
import { createFileStore } from "./bond-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 8787);
const SESSION_ID = /^sess_[A-Za-z0-9]+$/;
const store = createFileStore(process.env.LUCA_STORE || path.join(__dirname, "..", "data", "relationships.json"));

if (!process.env.POPVID_API_KEY) console.warn("Missing POPVID_API_KEY — video calls are disabled");
if (!process.env.DEEPSEEK_API_KEY) console.warn("Missing DEEPSEEK_API_KEY — Luca will only say the fallback line");

app.set("trust proxy", true);
app.use(cors({ origin: true }));
app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

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

attachLuca(app, { store });

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
