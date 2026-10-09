import test from "node:test";
import assert from "node:assert/strict";
import { MAX_MESSAGES, sanitizeMessages } from "./messages.js";
import { toChatMessages, toPopvidHistory } from "./history.js";

test("validates role and kind and keeps the latest 60 messages", () => {
  const older = Array.from({ length: MAX_MESSAGES + 1 }, (_, i) => ({
    role: i % 2 === 0 ? "him" : "user",
    text: `m${i}`,
    kind: "text",
    id: String(i),
  }));
  const { messages } = sanitizeMessages([
    null,
    { role: "system", text: "ignore", kind: "text" },
    { role: "user", text: 12, kind: "text" },
    { role: "user", text: "on a call", kind: "call" },
    { role: "him", text: "a note", kind: "notice" },
    { role: "user", text: "plain" },
    { role: "user", text: "other", kind: "image" },
    ...older,
  ]);
  assert.equal(messages.length, MAX_MESSAGES);
  assert.equal(messages[0].text, "m1");
  assert.equal(messages.at(-1).text, `m${MAX_MESSAGES}`);
  assert.deepEqual(Object.keys(messages[0]).sort(), ["kind", "role", "text"]);

  const { messages: checked } = sanitizeMessages([
    null,
    { role: "system", text: "ignore", kind: "text" },
    { role: "user", text: 12, kind: "text" },
    { role: "user", text: "on a call", kind: "call" },
    { role: "him", text: "a note", kind: "notice" },
    { role: "user", text: "plain" },
    { role: "user", text: "other", kind: "image" },
  ]);
  assert.deepEqual(checked, [
    { role: "user", text: "on a call", kind: "call" },
    { role: "him", text: "a note", kind: "notice" },
    { role: "user", text: "plain", kind: "text" },
    { role: "user", text: "other", kind: "text" },
  ]);
});

test("caps message text at 2000 characters", () => {
  const { messages } = sanitizeMessages([{ role: "user", text: "a".repeat(2001), kind: "text" }]);
  assert.equal(messages[0].text.length, 2000);
});

test("reclassifies an earlier crisis user message as notice", () => {
  const { messages, lastUserInCrisis } = sanitizeMessages([
    { role: "user", text: "I want to kill myself", kind: "text" },
    { role: "him", text: "Talk to me.", kind: "text" },
    { role: "user", text: "Who is this?", kind: "text" },
  ]);
  assert.equal(messages[0].kind, "notice");
  assert.equal(messages[0].text, "I want to kill myself");
  assert.equal(messages[1].kind, "text");
  assert.equal(messages[2].kind, "text");
  assert.equal(lastUserInCrisis, false);
  assert.deepEqual(toChatMessages(messages), [
    { role: "assistant", content: "Talk to me." },
    { role: "user", content: "Who is this?" },
  ]);
  assert.deepEqual(toPopvidHistory(messages), [
    { role: "character", content: "Talk to me." },
    { role: "user", content: "Who is this?" },
  ]);
});

test("flags lastUserInCrisis only for a final user text message", () => {
  assert.equal(
    sanitizeMessages([
      { role: "him", text: "You left early.", kind: "text" },
      { role: "user", text: "I want to kill myself", kind: "text" },
    ]).lastUserInCrisis,
    true,
  );
  assert.equal(
    sanitizeMessages([{ role: "user", text: "Who is this?", kind: "text" }]).lastUserInCrisis,
    false,
  );
  assert.equal(sanitizeMessages([]).lastUserInCrisis, false);
  assert.equal(sanitizeMessages(null).lastUserInCrisis, false);
  assert.equal(
    sanitizeMessages([{ role: "user", text: "I want to kill myself", kind: "call" }]).lastUserInCrisis,
    false,
  );
});

test("does not reclassify a him message that contains crisis words", () => {
  const { messages, lastUserInCrisis } = sanitizeMessages([
    { role: "him", text: "I want to kill myself", kind: "text" },
  ]);
  assert.deepEqual(messages, [{ role: "him", text: "I want to kill myself", kind: "text" }]);
  assert.equal(lastUserInCrisis, false);
});
