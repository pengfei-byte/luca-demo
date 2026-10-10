import test from "node:test";
import assert from "node:assert/strict";
import { PERSONA, chatSystemPrompt, videoCharacterPrompt, videoScenePrompt } from "./persona.js";

test("persona exposes what the client needs", () => {
  assert.equal(PERSONA.name, "Luca Vitale");
  assert.equal(PERSONA.shortName, "Luca");
  assert.equal(PERSONA.photo, "/luca.jpg");
  assert.equal(PERSONA.opener, "You left before I could ask you one question. May I ask it now?");
  assert.equal(PERSONA.quickReplies.length, 3);
});

test("both prompt families carry the content limits", () => {
  for (const prompt of [chatSystemPrompt(), videoCharacterPrompt()]) {
    assert.match(prompt, /PG-13/);
    assert.match(prompt, /do not claim to be human/i);
    assert.match(prompt, /988/);
  }
});

test("chat prompt asks for a plain text message", () => {
  const prompt = chatSystemPrompt();
  assert.match(prompt, /text message only/i);
  assert.match(prompt, /no JSON/i);
});

test("video prompts fit PopVid's 4000 character limit", () => {
  assert.ok(videoCharacterPrompt().length <= 4000);
  assert.ok(videoScenePrompt().length <= 4000);
  assert.match(videoCharacterPrompt(), /cannot see her/i);
  assert.doesNotMatch(videoCharacterPrompt(), /react to what you see/i);
  assert.doesNotMatch(chatSystemPrompt(), /bellweather/i);
});
