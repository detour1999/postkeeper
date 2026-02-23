// tests/state.test.js
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadState, saveState, isNewPost } from "../src/state.js";

describe("state manager", () => {
  const tmpDir = join(import.meta.dirname, ".tmp-state-test");

  beforeEach(() => mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("returns empty state when no file exists", () => {
    const state = loadState(join(tmpDir, "state.json"));
    assert.deepStrictEqual(state, {});
  });

  test("saves and loads state", () => {
    const path = join(tmpDir, "state.json");
    const state = { user1: "2026-02-23T00:00:00Z" };
    saveState(path, state);
    const loaded = loadState(path);
    assert.deepStrictEqual(loaded, state);
  });

  test("isNewPost returns true for post newer than last seen", () => {
    const state = { user1: "2026-02-20T00:00:00Z" };
    assert.strictEqual(isNewPost(state, "user1", "2026-02-22T00:00:00Z"), true);
  });

  test("isNewPost returns false for post older than last seen", () => {
    const state = { user1: "2026-02-22T00:00:00Z" };
    assert.strictEqual(isNewPost(state, "user1", "2026-02-20T00:00:00Z"), false);
  });

  test("isNewPost returns true when no previous state for user", () => {
    assert.strictEqual(isNewPost({}, "user1", "2026-02-22T00:00:00Z"), true);
  });
});
