import test from "node:test";
import assert from "node:assert/strict";
import { CRISIS_REPLY, detectCrisis } from "./safety.js";

test("flags common crisis phrasing", () => {
  for (const text of [
    "I want to kill myself",
    "honestly i've been feeling suicidal",
    "I just want to end it all",
    "sometimes I want to die",
    "I've been cutting myself again",
    "I keep thinking about self-harm",
    "there's no reason to live",
    "everyone would be better off dead without me",
  ]) {
    assert.equal(detectCrisis(text), true, text);
  }
});

test("does not flag dark-romance banter", () => {
  for (const text of [
    "I'd kill for you",
    "You're killing me with that smile",
    "Are you going to hurt him?",
    "I'm dying to see you",
    "",
  ]) {
    assert.equal(detectCrisis(text), false, text);
  }
});

test("crisis reply points to real help", () => {
  assert.match(CRISIS_REPLY, /988/);
  assert.match(CRISIS_REPLY, /741741/);
  assert.match(CRISIS_REPLY, /AI character/);
});
