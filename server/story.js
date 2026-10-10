import { CHAPTERS, chapterById, computeStage, isChapterAvailable } from "./content.js";
import { applyEvent } from "./progress.js";

function currentOpen(rel) {
  const done = new Set(rel.completedChapterIds || []);
  return CHAPTERS.find((chapter) => !done.has(chapter.id) && isChapterAvailable(rel, chapter)) || null;
}

export function matchAvailableChoice(rel, text) {
  const chapter = currentOpen(rel);
  const norm = String(text || "").trim().toLowerCase();
  if (!chapter || !norm) return null;
  const choice = chapter.choices.find((item) => item.label.trim().toLowerCase() === norm);
  if (!choice) return null;
  return { chapterId: chapter.id, choiceId: choice.id };
}

export function presentChapter(rel, chapterId) {
  const chapter = chapterById(chapterId);
  if (!chapter || !isChapterAvailable(rel, chapter)) return { error: "locked" };
  if ((rel.completedChapterIds || []).includes(chapter.id)) return { error: "completed", title: chapter.title };
  return {
    chapterId: chapter.id,
    title: chapter.title,
    hook: chapter.hook,
    choices: chapter.choices.map((choice) => ({ id: choice.id, label: choice.label })),
  };
}

export function applyChoice(rel, { chapterId, choiceId }, now = Date.now()) {
  const chapter = chapterById(chapterId);
  const choice = chapter?.choices.find((item) => item.id === choiceId);
  if (!chapter || !choice) return { error: "unknown" };
  const key = `${chapter.id}:${choice.id}`;
  const before = rel.stage;
  if ((rel.completedChapterIds || []).includes(chapter.id) || rel.choiceIds.includes(key)) {
    rel.stage = computeStage(rel);
    return {
      replay: true,
      reply: rel.choiceReplies[chapter.id] || rel.choiceReplies[key] || choice.reply,
      delta: 0,
      stageChanged: false,
      stage: rel.stage,
    };
  }
  if (!isChapterAvailable(rel, chapter)) return { error: "locked" };

  rel.choiceIds.push(key);
  rel.choiceReplies[key] = choice.reply;
  if (choice.memory) rel.memories.push({ id: `mem:${key}`, text: choice.memory });
  const scored = applyEvent(rel, { id: `choice:${key}`, kind: "story_choice" }, now);
  let chapterScore = { delta: 0, capped: false };
  if (choice.completes) {
    if (!rel.completedChapterIds.includes(chapter.id)) rel.completedChapterIds.push(chapter.id);
    rel.choiceReplies[chapter.id] = choice.reply;
    if (chapter.secretId && !rel.revealedSecretIds.includes(chapter.secretId)) {
      rel.revealedSecretIds.push(chapter.secretId);
    }
    if (chapter.id === "EP07" && !rel.revealedSecretIds.includes("S08")) rel.revealedSecretIds.push("S08");
    chapterScore = applyEvent(rel, { id: `chapter:${chapter.id}`, kind: "chapter_complete" }, now);
  }
  rel.stage = computeStage(rel);
  rel.updatedAt = now;
  return {
    replay: false,
    reply: choice.reply,
    delta: scored.delta + chapterScore.delta,
    capped: Boolean(scored.capped || chapterScore.capped),
    stage: rel.stage,
    stageChanged: rel.stage !== before,
    revealed: choice.completes ? chapter.secretId : null,
  };
}

export function applyDefinition(rel, definition, now = Date.now()) {
  if (definition !== "romantic" && definition !== "companion") return { error: "unknown" };
  if (!(rel.completedChapterIds || []).includes("EP06")) return { error: "locked" };
  if (rel.relationshipDefinition) {
    return { replay: true, definition: rel.relationshipDefinition, stage: rel.stage, stageChanged: false };
  }
  const before = rel.stage;
  rel.relationshipDefinition = definition;
  rel.stage = computeStage(rel);
  rel.version += 1;
  rel.updatedAt = now;
  return { definition, stage: rel.stage, stageChanged: rel.stage !== before };
}

export function activeChoices(rel) {
  const chapter = currentOpen(rel);
  if (!chapter) return [];
  return chapter.choices.map((choice) => ({ chapterId: chapter.id, id: choice.id, label: choice.label }));
}
