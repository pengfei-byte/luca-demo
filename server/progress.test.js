import test from "node:test";
import assert from "node:assert/strict";
import { applyEvent, blankRelationship, noteLatestTurn } from "./progress.js";
import { applyChoice } from "./story.js";
import { chatSystemPrompt } from "./persona.js";
import { profileView } from "./luca-api.js";

const user = (id, text) => ({ id, role: "user", text, kind: "text" });

test("three distinct replies add two points, repeats do not", () => {
  const rel = blankRelationship("a");
  assert.equal(noteLatestTurn(rel, user("1", "hello")).delta, 0);
  assert.equal(noteLatestTurn(rel, user("1", "hello again")).delta, 0);
  assert.equal(noteLatestTurn(rel, user("2", "hello")).delta, 0);
  assert.equal(noteLatestTurn(rel, user("3", "I'm still here")).delta, 0);
  assert.equal(noteLatestTurn(rel, user("4", "I think you're deciding for me")).delta, 2);
  assert.equal(rel.closenessScore, 2);
});

test("refusal does not reduce closeness", () => {
  const rel = blankRelationship("a");
  noteLatestTurn(rel, user("1", "Not tonight."));
  const before = rel.closenessScore;
  noteLatestTurn(rel, user("2", "No."));
  assert.ok(rel.closenessScore >= before);
});

test("daily cap stops at 12", () => {
  const rel = blankRelationship("a");
  for (let i = 0; i < 3; i += 1) applyEvent(rel, { id: `seg:${i}`, kind: "dialogue_segment" });
  for (let i = 0; i < 4; i += 1) applyEvent(rel, { id: `choice:${i}`, kind: "story_choice" });
  applyEvent(rel, { id: "chapter:a", kind: "chapter_complete" });
  applyEvent(rel, { id: "chapter:b", kind: "chapter_complete" });
  assert.equal(rel.closenessScore, 12);
});

test("stage needs the chapter, not only the score", () => {
  const rel = blankRelationship("a");
  rel.closenessScore = 80;
  rel.stage = "L0";
  applyEvent(rel, { id: "noop", kind: "other" });
  assert.equal(rel.stage, "L0");
});

test("a finished chapter reveals its secret and a replay does not score again", () => {
  const rel = blankRelationship("a");
  const first = applyChoice(rel, { chapterId: "EP00", choiceId: "not-tonight" });
  assert.equal(first.delta, 5);
  assert.equal(rel.completedChapterIds.includes("EP00"), true);
  const again = applyChoice(rel, { chapterId: "EP00", choiceId: "ask" });
  assert.equal(again.replay, true);
  assert.equal(again.delta, 0);
  assert.equal(rel.closenessScore, 5);
});

test("locked profile and the early prompt omit the hall", () => {
  const rel = blankRelationship("a");
  const view = profileView(rel);
  const packed = JSON.stringify(view);
  assert.equal(packed.toLowerCase().includes("bellweather"), false);
  assert.equal(view.secrets.every((secret) => secret.body == null), true);
  assert.equal(chatSystemPrompt({ factIds: [] }).toLowerCase().includes("bellweather"), false);
  rel.revealedSecretIds = ["S03"];
  assert.match(chatSystemPrompt({ factIds: rel.revealedSecretIds }), /Bellweather Hall/);
});
