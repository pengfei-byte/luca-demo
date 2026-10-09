process.env.POPVID_API_KEY = "test-key";
process.env.POPVID_BASE_URL = "https://popvid.test/api/public/v1";
process.env.MAX_CONCURRENT_SESSIONS = "2";
process.env.SEED_IMAGE_URL = "";
process.env.VOICE_REF_URL = "";
process.env.PUBLIC_BASE_URL = "";

import test from "node:test";
import assert from "node:assert/strict";

const { createCall, closeCall, renewLease, sweepCalls, activeCalls, MAX_CALL_MS } = await import("./popvid.js");

function sessionResponse(id) {
  return new Response(
    JSON.stringify({
      session: { session_id: id, reservation_expires_at_ms: 1 },
      credentials: { token: "t" },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

async function flush() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("reserves a slot before the upstream request resolves", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  let started = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  globalThis.fetch = async () => {
    started += 1;
    const id = `sess_slot${started}`;
    await gate;
    return sessionResponse(id);
  };

  const first = createCall({ messages: [], req: {} });
  const second = createCall({ messages: [], req: {} });
  const busy = await createCall({ messages: [], req: {} });
  assert.equal(started, 2);
  assert.equal(activeCalls(), 0);
  assert.equal(busy.ok, false);
  assert.equal(busy.status, 429);
  assert.equal(busy.error.code, "busy");
  assert.equal(busy.error.retry_after_ms, 5_000);

  release();
  const opened = await Promise.all([first, second]);
  assert.equal(opened.every((result) => result.ok), true);
  assert.equal(activeCalls(), 2);
  const full = await createCall({ messages: [], req: {} });
  assert.equal(full.status, 429);
  assert.equal(started, 2);

  globalThis.fetch = async () => new Response(null, { status: 200 });
  for (const result of opened) await closeCall(result.data.session.session_id);
  assert.equal(activeCalls(), 0);
});

test("retries a failed upstream close and gives up after 3 attempts", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warns = [];
  console.warn = (...args) => warns.push(args);
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  });

  globalThis.fetch = async () => sessionResponse("sess_close1");
  const opened = await createCall({ messages: [], req: {} });
  assert.equal(opened.ok, true);

  globalThis.fetch = async () => new Response(null, { status: 500 });
  await closeCall("sess_close1");
  assert.equal(activeCalls(), 1);
  await closeCall("sess_close1");
  assert.equal(activeCalls(), 1);
  await closeCall("sess_close1");
  assert.equal(activeCalls(), 0);
  assert.deepEqual(
    warns.map((args) => args.slice(0, 3)),
    [
      ["[call] close failed", "sess_close1", 500],
      ["[call] close failed", "sess_close1", 500],
      ["[call] close failed", "sess_close1", 500],
    ],
  );
});

test("treats a 404 close as done and retries a network error", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  console.warn = () => {};
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  });

  globalThis.fetch = async () => sessionResponse("sess_gone");
  assert.equal((await createCall({ messages: [], req: {} })).ok, true);
  globalThis.fetch = async () => new Response(null, { status: 404 });
  await closeCall("sess_gone");
  assert.equal(activeCalls(), 0);

  globalThis.fetch = async () => sessionResponse("sess_offline");
  assert.equal((await createCall({ messages: [], req: {} })).ok, true);
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  await closeCall("sess_offline");
  assert.equal(activeCalls(), 1);

  globalThis.fetch = async () => new Response(null, { status: 200 });
  await closeCall("sess_offline");
  assert.equal(activeCalls(), 0);
});

test("sweep retries a failed close and enforces the call age limit", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const originalNow = Date.now;
  let clock = 1_000_000;
  Date.now = () => clock;
  console.warn = () => {};
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    Date.now = originalNow;
  });

  globalThis.fetch = async () => sessionResponse("sess_age");
  const opened = await createCall({ messages: [], req: {} });
  assert.equal(opened.ok, true);

  let deletes = 0;
  globalThis.fetch = async () => {
    deletes += 1;
    return new Response(null, { status: 500 });
  };
  await closeCall("sess_age");
  assert.equal(activeCalls(), 1);
  deletes = 0;
  sweepCalls();
  await flush();
  assert.equal(deletes, 1);
  assert.equal(activeCalls(), 1);

  globalThis.fetch = async () => new Response(null, { status: 200 });
  await closeCall("sess_age");
  assert.equal(activeCalls(), 0);

  globalThis.fetch = async () => sessionResponse("sess_limit");
  assert.equal((await createCall({ messages: [], req: {} })).ok, true);
  clock = 1_000_000 + MAX_CALL_MS + 5_000;
  assert.equal(renewLease("sess_limit"), true);
  let limitDeletes = 0;
  globalThis.fetch = async () => {
    limitDeletes += 1;
    return new Response(null, { status: 200 });
  };
  sweepCalls();
  await flush();
  assert.equal(limitDeletes, 0);
  assert.equal(activeCalls(), 1);

  clock = 1_000_000 + MAX_CALL_MS + 5_001;
  assert.equal(renewLease("sess_limit"), true);
  sweepCalls();
  await flush();
  assert.equal(limitDeletes, 1);
  assert.equal(activeCalls(), 0);
});

test("aborts a hung create and releases the pending slot", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const previousTimeout = process.env.POPVID_CREATE_TIMEOUT_MS;
  process.env.POPVID_CREATE_TIMEOUT_MS = "80";
  console.error = () => {};
  t.after(() => {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    if (previousTimeout === undefined) delete process.env.POPVID_CREATE_TIMEOUT_MS;
    else process.env.POPVID_CREATE_TIMEOUT_MS = previousTimeout;
  });

  let attempts = 0;
  globalThis.fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      attempts += 1;
      const signal = init?.signal;
      const abort = () => {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        reject(error);
      };
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener("abort", abort, { once: true });
    });

  const started = Date.now();
  const hung = await createCall({ messages: [], req: {} });
  const elapsed = Date.now() - started;
  assert.equal(hung.ok, false);
  assert.equal(hung.status, 502);
  assert.equal(hung.error.code, "upstream_unreachable");
  assert.equal(attempts, 1);
  assert.ok(elapsed < 1_000, `timed out in ${elapsed}ms`);
  assert.equal(activeCalls(), 0);

  globalThis.fetch = async () => sessionResponse("sess_after_timeout_a");
  const first = await createCall({ messages: [], req: {} });
  globalThis.fetch = async () => sessionResponse("sess_after_timeout_b");
  const second = await createCall({ messages: [], req: {} });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notEqual(first.error?.code, "busy");
  assert.notEqual(second.error?.code, "busy");

  globalThis.fetch = async () => new Response(null, { status: 200 });
  await closeCall(first.data.session.session_id);
  await closeCall(second.data.session.session_id);
  assert.equal(activeCalls(), 0);
});
