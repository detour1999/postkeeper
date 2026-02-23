// tests/downloader.test.js
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPostOutputPath, writePostJSON } from "../src/downloader.js";

describe("downloader", () => {
  const tmpDir = join(import.meta.dirname, ".tmp-download-test");

  beforeEach(() => mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("buildPostOutputPath creates correct directory structure", () => {
    const post = {
      shortcode: "ABC123",
      username: "testuser",
      timestamp: "2026-02-23T14:30:00.000Z",
    };
    const result = buildPostOutputPath(tmpDir, post);
    assert.ok(result.jsonPath.includes("testuser"));
    assert.ok(result.jsonPath.includes("2026-02-23-ABC123.json"));
    assert.ok(result.mediaDir.includes("2026-02-23-ABC123"));
  });

  test("writePostJSON writes valid JSON file", () => {
    const post = {
      shortcode: "ABC123",
      username: "testuser",
      timestamp: "2026-02-23T14:30:00.000Z",
      caption: "Hello",
      media: [],
    };
    const paths = buildPostOutputPath(tmpDir, post);
    writePostJSON(paths.jsonPath, post);
    assert.ok(existsSync(paths.jsonPath));
    const written = JSON.parse(readFileSync(paths.jsonPath, "utf-8"));
    assert.strictEqual(written.shortcode, "ABC123");
  });
});
