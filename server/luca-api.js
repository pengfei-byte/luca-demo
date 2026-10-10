import { randomBytes } from "node:crypto";
import { PUBLIC_PROFILE, authorizeUtterance, availableActions, chapterCards, guardTerms, nextGuidance, secretCards, stageName, stageVoice } from "./content.js";
import { PERSONA, chatSystemPrompt, videoCharacterPrompt, videoScenePrompt } from "./persona.js";
import { blankRelationship, forgetMemory, noteLatestTurn, setPreferences } from "./progress.js";
import { activeChoices, applyChoice, applyDefinition, matchAvailableChoice, presentChapter } from "./story.js";
import { generateReply } from "./chat.js";
import { CRISIS_REPLY } from "./safety.js";
import { sanitizeMessages } from "./messages.js";
import { createCall } from "./popvid.js";

const COOKIE = "luca_vid";
const CALL_EVENTS = new Set(["call_ended", "call_declined", "call_dropped"]);

function readCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => {
        const index = part.indexOf("=");
        if (index < 0) return null;
        return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
      })
      .filter(Boolean),
  );
}

function visitorId(req, res) {
  const existing = readCookies(req)[COOKIE];
  if (/^[a-f0-9]{32}$/.test(existing || "")) return existing;
  const id = randomBytes(16).toString("hex");
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
  return id;
}

export function bondView(rel) {
  return {
    stage: rel.stage,
    stageName: stageName(rel.stage),
    closeness: rel.closenessScore,
    next: nextGuidance(rel),
    preferences: rel.preferences,
    definition: rel.relationshipDefinition,
    dailyPoints: rel.windowPoints,
    dailyCap: 12,
    actions: availableActions(rel).map(({ id, label }) => ({ id, label })),
    choices: activeChoices(rel),
  };
}

export function profileView(rel) {
  return {
    profile: PUBLIC_PROFILE,
    name: PERSONA.name,
    shortName: PERSONA.shortName,
    photo: PERSONA.photo,
    bond: bondView(rel),
    secrets: secretCards(rel),
    chapters: chapterCards(rel),
    memories: rel.memories,
  };
}

function promptFor(rel) {
  return chatSystemPrompt({
    stage: rel.stage,
    voice: stageVoice(rel.stage),
    flirt: rel.preferences?.flirt !== "off",
    nickname: rel.preferences?.nickname === true && ["L2", "L3", "L4"].includes(rel.stage),
    factIds: rel.revealedSecretIds || [],
    memories: (rel.memories || []).map((memory) => memory.text),
  });
}

function lastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === "user" && (message.kind ?? "text") === "text") return message;
  }
  return null;
}

export function attachLuca(app, { store, replyImpl = generateReply } = {}) {
  app.get("/api/relationship", async (req, res) => {
    const id = visitorId(req, res);
    const rel = await store.update(id, (current) => current);
    res.json(bondView(rel));
  });

  app.get("/api/luca/profile", async (req, res) => {
    const id = visitorId(req, res);
    const rel = await store.update(id, (current) => current);
    res.json(profileView(rel));
  });

  app.patch("/api/relationship/preferences", async (req, res) => {
    const id = visitorId(req, res);
    const rel = await store.update(id, (current) => {
      setPreferences(current, req.body || {});
      return current;
    });
    res.json(bondView(rel));
  });

  app.post("/api/relationship/definition", async (req, res) => {
    const id = visitorId(req, res);
    let result = null;
    const rel = await store.update(id, (current) => {
      result = applyDefinition(current, req.body?.definition);
      return current;
    });
    if (result?.error) return res.status(403).json(result);
    res.json({ ...result, bond: bondView(rel) });
  });

  app.delete("/api/relationship/memories/:memoryId", async (req, res) => {
    const id = visitorId(req, res);
    let removed = false;
    const rel = await store.update(id, (current) => {
      removed = forgetMemory(current, req.params.memoryId);
      return current;
    });
    if (!removed) return res.status(404).json({ ok: false });
    res.json(profileView(rel));
  });

  app.post("/api/relationship/decline", async (req, res) => {
    const id = visitorId(req, res);
    const rel = await store.update(id, (current) => {
      current.lastDeclinedAt = Date.now();
      current.version += 1;
      return current;
    });
    res.json(bondView(rel));
  });

  app.post("/api/relationship/reset", async (req, res) => {
    const id = visitorId(req, res);
    if (req.body?.confirm !== true) return res.status(400).json({ error: "confirm" });
    const rel = await store.update(id, () => blankRelationship(id));
    res.json(profileView(rel));
  });

  app.post("/api/story/open", async (req, res) => {
    const id = visitorId(req, res);
    const rel = await store.update(id, (current) => current);
    const presented = presentChapter(rel, req.body?.chapterId);
    if (presented.error) return res.status(403).json(presented);
    res.json(presented);
  });

  app.post("/api/story/choice", async (req, res) => {
    const id = visitorId(req, res);
    let result = null;
    const rel = await store.update(id, (current) => {
      result = applyChoice(current, { chapterId: req.body?.chapterId, choiceId: req.body?.choiceId });
      return current;
    });
    if (result?.error) return res.status(result.error === "unknown" ? 400 : 403).json(result);
    res.json({ ...result, bond: bondView(rel), replaceReplies: true, quickReplies: bondView(rel).choices.map((choice) => choice.label) });
  });

  app.post("/api/chat", async (req, res) => {
    const { messages, lastUserInCrisis } = sanitizeMessages(req.body?.messages);
    const event = CALL_EVENTS.has(req.body?.event) ? req.body.event : null;
    if (!event && lastUserInCrisis) {
      return res.json({ reply: CRISIS_REPLY, call: false, quickReplies: [], notice: true });
    }
    const id = visitorId(req, res);
    const latest = lastUserMessage(messages);
    let choice = null;
    let progress = null;
    const rel = await store.update(id, (current) => {
      const before = current.stage;
      const match = latest ? matchAvailableChoice(current, latest.text) : null;
      if (match) {
        choice = applyChoice(current, match);
        progress = { delta: choice.delta || 0, capped: Boolean(choice.capped), stageChanged: current.stage !== before };
        return current;
      }
      if (latest && !event) progress = { ...noteLatestTurn(current, latest), stageChanged: current.stage !== before };
      else progress = { delta: 0, capped: false, stageChanged: false };
      return current;
    });
    if (choice && !choice.error) {
      return res.json({
        reply: choice.reply,
        call: false,
        quickReplies: activeChoices(rel).map((item) => item.label),
        replaceReplies: true,
        story: true,
        progress: { ...progress, ...bondView(rel) },
      });
    }
    const result = await replyImpl({
      messages,
      event,
      durationMs: Number(req.body?.durationMs) || 0,
      systemPrompt: promptFor(rel),
      guardTerms: guardTerms(rel.revealedSecretIds),
    });
    const quickReplies = (result.quickReplies || []).filter(
      (line) => !guardTerms(rel.revealedSecretIds).some((term) => line.toLowerCase().includes(term)),
    );
    res.json({
      ...result,
      quickReplies,
      progress: progress ? { ...progress, ...bondView(rel) } : bondView(rel),
    });
  });

  app.post("/api/call/line", async (req, res) => {
    const id = visitorId(req, res);
    const rel = await store.update(id, (current) => current);
    res.json(authorizeUtterance(rel, { actionId: req.body?.actionId, text: req.body?.text }));
  });

  app.post("/api/call", async (req, res) => {
    const id = visitorId(req, res);
    const rel = await store.update(id, (current) => current);
    const { messages } = sanitizeMessages(req.body?.messages);
    const result = await createCall({
      messages,
      req,
      characterPrompt: videoCharacterPrompt({ voice: stageVoice(rel.stage), factIds: rel.revealedSecretIds }),
      scenePrompt: videoScenePrompt(),
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.status(201).json({ ...result.data, actions: availableActions(rel).map(({ id: actionId, label }) => ({ id: actionId, label })) });
  });
}
