import test from "node:test";
import assert from "node:assert/strict";
import { FALLBACK_REPLY, decideCall, generateReply, parseModelOutput } from "./chat.js";

const env = { DEEPSEEK_API_KEY: "test-key" };
const msg = (role, text, kind = "text") => ({ id: text, role, text, kind, ts: 0 });
const turns = (n) => {
  const list = [msg("him", "opener")];
  for (let i = 0; i < n; i += 1) list.push(msg("user", `u${i}`), msg("him", `h${i}`));
  list.pop();
  return list;
};

function fakeFetch(contents) {
  const calls = [];
  const queue = [...contents];
  const impl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: next } }] }) };
  };
  return { impl, calls };
}

test("parses the JSON contract", () => {
  assert.deepEqual(
    parseModelOutput('{"reply":" Pick up. ","call":true,"quick_replies":["a","b","c","d"]}'),
    { reply: "Pick up.", call: true, quickReplies: ["a", "b", "c"] },
  );
});

test("falls back to raw text when the model ignores JSON", () => {
  assert.deepEqual(parseModelOutput("Just text."), { reply: "Just text.", call: false, quickReplies: [] });
});

test("marks an empty reply as retryable", () => {
  assert.deepEqual(parseModelOutput('{"reply":""}'), { reply: FALLBACK_REPLY, call: false, quickReplies: [], retryable: true });
});

test("call decision rules", () => {
  assert.equal(decideCall({ modelWantsCall: true, userTurns: 2, calledOnce: false, event: null }), true);
  assert.equal(decideCall({ modelWantsCall: false, userTurns: 5, calledOnce: false, event: null }), false);
  assert.equal(decideCall({ modelWantsCall: false, userTurns: 6, calledOnce: false, event: null }), true);
  assert.equal(decideCall({ modelWantsCall: true, userTurns: 6, calledOnce: true, event: null }), false);
  assert.equal(decideCall({ modelWantsCall: true, userTurns: 3, calledOnce: false, event: "call_ended" }), false);
});

test("sends the system prompt, history and JSON mode to DeepSeek", async () => {
  const { impl, calls } = fakeFetch(['{"reply":"Careful.","call":false,"quick_replies":["x"]}']);
  const result = await generateReply({ messages: turns(1), fetchImpl: impl, env });
  assert.deepEqual(result, { reply: "Careful.", call: false, quickReplies: ["x"] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions");
  assert.equal(calls[0].headers.Authorization, "Bearer test-key");
  assert.equal(calls[0].body.model, "deepseek-chat");
  assert.deepEqual(calls[0].body.response_format, { type: "json_object" });
  assert.equal(calls[0].body.messages[0].role, "system");
  assert.deepEqual(calls[0].body.messages.at(-1), { role: "user", content: "u0" });
});

test("forces the call on the sixth user message", async () => {
  const { impl } = fakeFetch(['{"reply":"Pick up.","call":false}']);
  const result = await generateReply({ messages: turns(6), fetchImpl: impl, env });
  assert.equal(result.call, true);
});

test("never calls twice", async () => {
  const { impl } = fakeFetch(['{"reply":"Pick up.","call":true}']);
  const result = await generateReply({ messages: turns(6), calledOnce: true, fetchImpl: impl, env });
  assert.equal(result.call, false);
});

test("appends a stage note for call events", async () => {
  const { impl, calls } = fakeFetch(['{"reply":"You hung up first.","call":false}']);
  await generateReply({ messages: turns(2), event: "call_ended", durationMs: 192_000, fetchImpl: impl, env });
  const last = calls[0].body.messages.at(-1);
  assert.equal(last.role, "user");
  assert.match(last.content, /^\[.*3:12.*\]$/);
});

test("retries once, then falls back", async (t) => {
  t.mock.method(console, "warn", () => {});
  const { impl, calls } = fakeFetch([new Error("boom"), new Error("boom again")]);
  const result = await generateReply({ messages: turns(1), fetchImpl: impl, env });
  assert.equal(calls.length, 2);
  assert.deepEqual(result, {
    reply: FALLBACK_REPLY,
    call: false,
    quickReplies: [],
    retryable: true,
    upstream: "boom again",
  });
});

test("succeeds on the retry", async (t) => {
  t.mock.method(console, "warn", () => {});
  const { impl, calls } = fakeFetch([new Error("boom"), '{"reply":"Here.","call":false}']);
  const result = await generateReply({ messages: turns(1), fetchImpl: impl, env });
  assert.equal(calls.length, 2);
  assert.equal(result.reply, "Here.");
});

test("without a key, does not call out", async () => {
  const { impl, calls } = fakeFetch([]);
  const result = await generateReply({ messages: turns(1), fetchImpl: impl, env: {} });
  assert.equal(calls.length, 0);
  assert.equal(result.retryable, true);
});
