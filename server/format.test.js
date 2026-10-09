import test from "node:test";
import assert from "node:assert/strict";
import { formatDuration } from "./format.js";

test("formats milliseconds as m:ss", () => {
  assert.equal(formatDuration(0), "0:00");
  assert.equal(formatDuration(9_400), "0:09");
  assert.equal(formatDuration(192_000), "3:12");
  assert.equal(formatDuration(300_000), "5:00");
});

test("treats bad input as zero", () => {
  assert.equal(formatDuration(undefined), "0:00");
  assert.equal(formatDuration(-5), "0:00");
});
