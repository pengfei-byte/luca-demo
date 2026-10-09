import test from "node:test";
import assert from "node:assert/strict";
import { toChatMessages, toPopvidHistory } from "./history.js";

const msg = (role, text, kind = "text") => ({ id: text, role, text, kind, ts: 0 });

test("maps roles for PopVid and drops non-text entries", () => {
  const history = toPopvidHistory([
    msg("him", "Hello."),
    msg("user", "Hi."),
    msg("him", "Video call · 1:02", "call"),
    msg("him", "Stepping out of the story", "notice"),
    msg("user", "   "),
  ]);
  assert.deepEqual(history, [
    { role: "character", content: "Hello." },
    { role: "user", content: "Hi." },
  ]);
});

test("keeps only the latest 40 messages for PopVid", () => {
  const many = Array.from({ length: 45 }, (_, i) => msg(i % 2 ? "user" : "him", `m${i}`));
  const history = toPopvidHistory(many);
  assert.equal(history.length, 40);
  assert.equal(history[0].content, "m5");
  assert.equal(history[39].content, "m44");
});

test("truncates long messages to 2000 characters", () => {
  const [entry] = toPopvidHistory([msg("user", "x".repeat(2500))]);
  assert.equal(entry.content.length, 2000);
});

test("maps roles for the chat model with a limit", () => {
  const many = Array.from({ length: 35 }, (_, i) => msg(i % 2 ? "user" : "him", `m${i}`));
  const chat = toChatMessages(many, 30);
  assert.equal(chat.length, 30);
  assert.deepEqual(chat[0], { role: "user", content: "m5" });
  assert.deepEqual(chat[1], { role: "assistant", content: "m6" });
});

test("tolerates missing input", () => {
  assert.deepEqual(toPopvidHistory(undefined), []);
  assert.deepEqual(toChatMessages(null), []);
});
