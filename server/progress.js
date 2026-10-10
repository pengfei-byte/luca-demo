import { computeStage } from "./content.js";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DAILY_CAP = 12;

export function blankRelationship(ownerId, now = Date.now()) {
  return {
    id: ownerId,
    ownerId,
    closenessScore: 0,
    stage: "L0",
    version: 1,
    canonVersion: 1,
    completedChapterIds: [],
    choiceIds: [],
    choiceReplies: {},
    revealedSecretIds: [],
    relationshipDefinition: null,
    preferences: { flirt: "light", touch: false, nickname: false },
    memories: [],
    windowStart: now,
    windowPoints: 0,
    windowSegments: 0,
    windowChoices: 0,
    windowChapters: 0,
    countedMessageIds: [],
    recentUserTexts: [],
    pendingTurns: 0,
    appliedEventIds: [],
    lastDeclinedAt: null,
    updatedAt: now,
  };
}

function rollWindow(rel, now) {
  if (now - rel.windowStart >= DAY_MS) {
    rel.windowStart = now;
    rel.windowPoints = 0;
    rel.windowSegments = 0;
    rel.windowChoices = 0;
    rel.windowChapters = 0;
  }
}

export function applyEvent(rel, event, now = Date.now()) {
  rollWindow(rel, now);
  const id = String(event?.id || "");
  if (!id || rel.appliedEventIds.includes(id)) {
    rel.stage = computeStage(rel);
    return { delta: 0, duplicate: true, capped: false, stage: rel.stage };
  }
  let points = 0;
  let blocked = false;
  if (event.kind === "dialogue_segment") {
    blocked = rel.windowSegments >= 3;
    points = blocked ? 0 : 2;
    if (points) rel.windowSegments += 1;
  } else if (event.kind === "story_choice") {
    blocked = rel.windowChoices >= 2;
    points = blocked ? 0 : 2;
    if (points) rel.windowChoices += 1;
  } else if (event.kind === "chapter_complete") {
    blocked = rel.windowChapters >= 2;
    points = blocked ? 0 : 3;
    if (points) rel.windowChapters += 1;
  }
  if (rel.windowPoints + points > DAILY_CAP) {
    points = Math.max(0, DAILY_CAP - rel.windowPoints);
    blocked = points === 0;
  }
  rel.windowPoints += points;
  rel.closenessScore += points;
  rel.appliedEventIds.push(id);
  rel.appliedEventIds = rel.appliedEventIds.slice(-400);
  rel.stage = computeStage(rel);
  rel.version += 1;
  rel.updatedAt = now;
  return { delta: points, duplicate: false, capped: blocked || rel.windowPoints >= DAILY_CAP, stage: rel.stage };
}

export function noteLatestTurn(rel, message, now = Date.now()) {
  if (!message || message.role !== "user" || (message.kind ?? "text") !== "text") {
    return { delta: 0, capped: false };
  }
  const messageId = String(message.id || "");
  const text = String(message.text || "").trim();
  const norm = text.toLowerCase();
  if (!messageId || norm.length < 2 || rel.countedMessageIds.includes(messageId) || rel.recentUserTexts.includes(norm)) {
    return { delta: 0, capped: false };
  }
  rel.countedMessageIds.push(messageId);
  rel.countedMessageIds = rel.countedMessageIds.slice(-200);
  rel.recentUserTexts = [...rel.recentUserTexts, norm].slice(-8);
  rel.pendingTurns += 1;
  if (rel.pendingTurns < 3) return { delta: 0, capped: false };
  rel.pendingTurns = 0;
  return applyEvent(rel, { id: `seg:${messageId}`, kind: "dialogue_segment" }, now);
}

export function setPreferences(rel, patch = {}) {
  const next = { ...rel.preferences };
  if (patch.flirt === "off" || patch.flirt === "light") next.flirt = patch.flirt;
  if (typeof patch.touch === "boolean") next.touch = patch.touch;
  if (typeof patch.nickname === "boolean") next.nickname = patch.nickname;
  rel.preferences = next;
  rel.version += 1;
  rel.updatedAt = Date.now();
  return next;
}

export function forgetMemory(rel, memoryId) {
  const before = rel.memories.length;
  rel.memories = rel.memories.filter((memory) => memory.id !== memoryId);
  if (rel.memories.length === before) return false;
  rel.version += 1;
  rel.updatedAt = Date.now();
  return true;
}
