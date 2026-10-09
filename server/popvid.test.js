import test from "node:test";
import assert from "node:assert/strict";
import { buildSessionBody } from "./popvid.js";

const messages = [
  { id: "1", role: "him", text: "You left early.", kind: "text", ts: 0 },
  { id: "2", role: "user", text: "I had to.", kind: "text", ts: 0 },
  { id: "3", role: "him", text: "Video call · 0:40", kind: "call", ts: 0 },
];

test("builds a PopVid session with persona, scene and history", () => {
  const body = buildSessionBody({ messages, seedImageUrl: "https://demo.example/luca.jpg", voiceRefUrl: "" });
  assert.equal(body.model, "r2-realtime-v1");
  assert.equal(body.character.name, "Luca Vitale");
  assert.ok(body.character.prompt.length <= 4000);
  assert.ok(body.scene.prompt.length <= 4000);
  assert.equal(body.language, "en");
  assert.equal(body.seed_image_url, "https://demo.example/luca.jpg");
  assert.equal("voice_ref_url" in body.character, false);
  assert.deepEqual(body.history, [
    { role: "character", content: "You left early." },
    { role: "user", content: "I had to." },
  ]);
  assert.ok(body.credentials_ttl_ms >= 300_000);
});

test("omits the seed when there is none and adds a voice when given", () => {
  const body = buildSessionBody({ messages: [], seedImageUrl: null, voiceRefUrl: "https://cdn.example/voice.mp3" });
  assert.equal("seed_image_url" in body, false);
  assert.equal(body.character.voice_ref_url, "https://cdn.example/voice.mp3");
  assert.deepEqual(body.history, []);
});
