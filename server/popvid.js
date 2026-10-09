import { PERSONA, videoCharacterPrompt, videoScenePrompt } from "./persona.js";
import { toPopvidHistory } from "./history.js";

const BASE = process.env.POPVID_BASE_URL || "https://popvid.ai/api/public/v1";
const KEY = process.env.POPVID_API_KEY;
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
const SEED_IMAGE_URL = (process.env.SEED_IMAGE_URL || "").trim();
const VOICE_REF_URL = (process.env.VOICE_REF_URL || "").trim();
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_SESSIONS || 3);

export const MAX_CALL_MS = 300_000;
const LEASE_MS = 25_000;
const BUSY_RETRY_MS = 5_000;

const calls = new Map();
let pending = 0;

function publicOrigin(req) {
  if (PUBLIC_BASE) return PUBLIC_BASE;
  const xfProto = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const xfHost = String(req?.headers?.["x-forwarded-host"] || "").split(",")[0].trim();
  const host = xfHost || req?.headers?.host || "";
  const proto = xfProto || (req?.protocol === "https" || req?.secure ? "https" : "http");
  if (!host || /localhost|127\.0\.0\.1/i.test(host)) return "";
  return `${proto}://${host}`;
}

function seedUrl(req) {
  if (SEED_IMAGE_URL) return SEED_IMAGE_URL;
  const origin = publicOrigin(req);
  return origin ? `${origin}${PERSONA.photo}` : null;
}

function authHeaders() {
  return { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
}

export function buildSessionBody({ messages, seedImageUrl, voiceRefUrl }) {
  const character = { name: PERSONA.name, prompt: videoCharacterPrompt() };
  if (voiceRefUrl) character.voice_ref_url = voiceRefUrl;
  const body = {
    model: "r2-realtime-v1",
    character,
    scene: { prompt: videoScenePrompt() },
    language: "en",
    history: toPopvidHistory(messages),
    limits: { max_turns: 200, turn_rate_per_min: 20 },
    credentials_ttl_ms: 600_000,
    metadata: { product: "luca" },
  };
  if (seedImageUrl) body.seed_image_url = seedImageUrl;
  return body;
}

async function postConnection(body) {
  const res = await fetch(`${BASE}/connections`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function createCall({ messages, req }) {
  if (!KEY) {
    return { ok: false, status: 503, error: { code: "misconfigured", message: "Video is not configured." } };
  }
  if (calls.size + pending >= MAX_CONCURRENT) {
    return { ok: false, status: 429, error: { code: "busy", retry_after_ms: BUSY_RETRY_MS } };
  }

  pending += 1;
  try {
    let result;
    try {
      result = await postConnection(buildSessionBody({ messages, seedImageUrl: seedUrl(req), voiceRefUrl: VOICE_REF_URL }));
      const code = result.data?.error?.code;
      if (!result.ok && !["no_capacity", "unauthorized", "budget_exhausted"].includes(code)) {
        console.warn("[call] retrying without seed after", result.status, code);
        result = await postConnection(buildSessionBody({ messages, seedImageUrl: null, voiceRefUrl: VOICE_REF_URL }));
      }
    } catch (err) {
      console.error("[call] PopVid unreachable", err);
      return { ok: false, status: 502, error: { code: "upstream_unreachable", message: "The call did not connect." } };
    }

    if (!result.ok) {
      const raw = result.data?.error || {};
      if (raw.code === "no_capacity") {
        return { ok: false, status: 429, error: { code: "busy", retry_after_ms: raw.retry_after_ms || BUSY_RETRY_MS } };
      }
      console.error("[call] rejected", result.status, raw);
      return {
        ok: false,
        status: result.status || 502,
        error: { code: raw.code || "upstream", message: raw.message || "The call did not connect." },
      };
    }

    const { session, credentials } = result.data || {};
    if (!session?.session_id || !credentials) {
      return { ok: false, status: 502, error: { code: "bad_payload", message: "The call did not connect." } };
    }

    const now = Date.now();
    calls.set(session.session_id, { createdAt: now, lastLease: now });
    return {
      ok: true,
      status: 201,
      data: {
        credentials,
        session: {
          session_id: session.session_id,
          reservation_expires_at_ms: session.reservation_expires_at_ms,
        },
      },
    };
  } finally {
    pending -= 1;
  }
}

export function renewLease(id) {
  const row = calls.get(id);
  if (!row) return false;
  row.lastLease = Date.now();
  return true;
}

function requeueClose(id, prev, detail) {
  console.warn("[call] close failed", id, detail);
  const closeAttempts = (prev?.closeAttempts || 0) + 1;
  if (closeAttempts >= 3) return;
  calls.set(id, { createdAt: 0, lastLease: 0, closeAttempts });
}

export async function closeCall(id) {
  if (!id) return;
  const prev = calls.get(id);
  calls.delete(id);
  if (!KEY) return;
  try {
    const res = await fetch(`${BASE}/sessions/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
    if (!res.ok && res.status !== 404) requeueClose(id, prev, res.status);
  } catch (err) {
    requeueClose(id, prev, err.message);
  }
}

export function sweepCalls(now = Date.now()) {
  for (const [id, row] of calls) {
    if (now - row.lastLease > LEASE_MS || now - row.createdAt > MAX_CALL_MS + 5_000) {
      closeCall(id);
    }
  }
}

export function activeCalls() {
  return calls.size;
}
