import test from "node:test";
import assert from "node:assert/strict";
import { initialState, makeMessage } from "./store.js";

const persona = { opener: "You left before I could ask your name. I found it anyway.", quickReplies: ["a", "b", "c"] };

test("makeMessage defaults to a text message", () => {
  const m = makeMessage("him", "Careful.");
  assert.equal(m.role, "him");
  assert.equal(m.text, "Careful.");
  assert.equal(m.kind, "text");
  assert.equal(typeof m.id, "string");
  assert.equal(typeof m.ts, "number");
});

test("makeMessage accepts extra fields", () => {
  const m = makeMessage("him", "Video call · 1:00", { kind: "call", durationMs: 60_000 });
  assert.equal(m.kind, "call");
  assert.equal(m.durationMs, 60_000);
});

test("initial state opens with his message", () => {
  const s = initialState(persona);
  assert.equal(s.gatePassed, false);
  assert.equal(s.calledOnce, false);
  assert.deepEqual(s.quickReplies, ["a", "b", "c"]);
  assert.equal(s.messages.length, 1);
  assert.equal(s.messages[0].role, "him");
  assert.equal(s.messages[0].text, persona.opener);
});
