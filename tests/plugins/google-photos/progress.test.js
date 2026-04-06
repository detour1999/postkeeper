// ABOUTME: Tests for the Google Photos progress/checkpoint module.
// ABOUTME: Validates load, save, markDiscovered, and markCompleted operations.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadProgress,
  saveProgress,
  markDiscovered,
  markCompleted,
  getPending,
} from "../../../plugins/google-photos/progress.js";

let testDir;

beforeEach(() => {
  testDir = join(tmpdir(), `postkeeper-progress-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("Google Photos progress", () => {
  test("loadProgress returns empty state when no file exists", () => {
    const progress = loadProgress(testDir);
    assert.deepStrictEqual(progress.discovered, []);
    assert.deepStrictEqual(progress.completed, new Set());
  });

  test("saveProgress writes to disk and loadProgress reads it back", () => {
    const progress = {
      discovered: ["id1", "id2"],
      completed: new Set(["id1"]),
    };
    saveProgress(testDir, progress);
    const loaded = loadProgress(testDir);
    assert.deepStrictEqual(loaded.discovered, ["id1", "id2"]);
    assert.ok(loaded.completed.has("id1"));
    assert.strictEqual(loaded.completed.size, 1);
  });

  test("markDiscovered appends new IDs without duplicates", () => {
    const progress = { discovered: ["id1"], completed: new Set() };
    markDiscovered(progress, ["id1", "id2", "id3"]);
    assert.deepStrictEqual(progress.discovered, ["id1", "id2", "id3"]);
  });

  test("markCompleted adds ID to completed set", () => {
    const progress = { discovered: ["id1", "id2"], completed: new Set() };
    markCompleted(progress, "id1");
    assert.ok(progress.completed.has("id1"));
  });

  test("getPending returns discovered items not yet completed", () => {
    const progress = {
      discovered: ["id1", "id2", "id3"],
      completed: new Set(["id1"]),
    };
    const pending = getPending(progress);
    assert.deepStrictEqual(pending, ["id2", "id3"]);
  });

  test("getPending returns empty array when all completed", () => {
    const progress = { discovered: ["id1"], completed: new Set(["id1"]) };
    const pending = getPending(progress);
    assert.deepStrictEqual(pending, []);
  });
});
