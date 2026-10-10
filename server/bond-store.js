import fs from "node:fs";
import path from "node:path";
import { blankRelationship } from "./progress.js";

function clone(value) {
  return structuredClone(value);
}

export function createMemoryStore() {
  const rows = new Map();
  let chain = Promise.resolve();
  function run(fn) {
    const next = chain.then(fn, fn);
    chain = next.then(
      () => {},
      () => {},
    );
    return next;
  }
  return {
    async update(ownerId, fn, now = Date.now()) {
      return run(async () => {
        const current = rows.get(ownerId) || blankRelationship(ownerId, now);
        const next = (await fn(clone(current))) || current;
        rows.set(ownerId, clone(next));
        return clone(next);
      });
    },
  };
}

export function createFileStore(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let rows = {};
  try {
    rows = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    rows = {};
  }
  let chain = Promise.resolve();
  function run(fn) {
    const next = chain.then(fn, fn);
    chain = next.then(
      () => {},
      () => {},
    );
    return next;
  }
  return {
    async update(ownerId, fn, now = Date.now()) {
      return run(async () => {
        const current = rows[ownerId] || blankRelationship(ownerId, now);
        const next = (await fn(clone(current))) || current;
        rows[ownerId] = clone(next);
        fs.writeFileSync(file, JSON.stringify(rows));
        return clone(next);
      });
    },
  };
}
