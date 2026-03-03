// tests/scripts/migrate.test.js
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const scriptPath = join(import.meta.dirname, "../../scripts/migrate-from-instapost.js");

describe("migrate-from-instapost", () => {
  const tmpDir = join(import.meta.dirname, ".tmp-migrate-test");

  beforeEach(() => mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("migrates posts from output/ to archive/ format", () => {
    // Set up old format
    const postDir = join(tmpDir, "output", "posts", "testuser");
    mkdirSync(postDir, { recursive: true });

    const oldPost = {
      shortcode: "ABC123",
      url: "https://www.instagram.com/p/ABC123/",
      id: "12345",
      username: "testuser",
      timestamp: "2024-03-15T14:30:00.000Z",
      caption: "Hello",
      location: null,
      tagged_users: [],
      alt_text: null,
      likes: 10,
      comments: 2,
      media_type: "image",
      media: [{ type: "image", url: "https://example.com/img.jpg", file: "1.jpg" }],
    };
    writeFileSync(join(postDir, "2024-03-15-ABC123.json"), JSON.stringify(oldPost));

    // Create media dir
    const mediaDir = join(postDir, "2024-03-15-ABC123");
    mkdirSync(mediaDir);
    writeFileSync(join(mediaDir, "1.jpg"), "fake image");

    // Run migration
    const output = execFileSync("node", [scriptPath], { encoding: "utf-8", cwd: tmpDir });

    // Check output
    assert.ok(output.includes("Migrated 1 post(s) for @testuser"));

    // Check AS2 file
    const as2Path = join(tmpDir, "archive", "instagram", "posts", "testuser", "2024-03-15-ABC123.as2.json");
    assert.ok(existsSync(as2Path), "AS2 file should exist");
    const as2 = JSON.parse(readFileSync(as2Path, "utf-8"));
    assert.strictEqual(as2["@context"], "https://www.w3.org/ns/activitystreams");

    // Check raw file
    const rawPath = join(tmpDir, "archive", "instagram", "posts", "testuser", "2024-03-15-ABC123.raw.json");
    assert.ok(existsSync(rawPath), "Raw file should exist");

    // Check media copied
    const mediaDest = join(tmpDir, "archive", "instagram", "posts", "testuser", "2024-03-15-ABC123", "1.jpg");
    assert.ok(existsSync(mediaDest), "Media should be copied");
  });

  test("dry-run does not write files", () => {
    const postDir = join(tmpDir, "output", "posts", "testuser");
    mkdirSync(postDir, { recursive: true });
    writeFileSync(join(postDir, "2024-01-01-TEST.json"), JSON.stringify({
      shortcode: "TEST",
      url: "https://www.instagram.com/p/TEST/",
      id: "1",
      username: "testuser",
      timestamp: "2024-01-01T00:00:00.000Z",
      caption: "",
      location: null,
      tagged_users: [],
      alt_text: null,
      likes: 0,
      comments: 0,
      media_type: "image",
      media: [{ type: "image", url: "https://example.com/img.jpg", file: "1.jpg" }],
    }));

    const output = execFileSync("node", [scriptPath, "--dry-run"], { encoding: "utf-8", cwd: tmpDir });
    assert.ok(output.includes("Would migrate"));
    assert.ok(!existsSync(join(tmpDir, "archive")));
  });

  test("exits cleanly when no output directory exists", () => {
    const output = execFileSync("node", [scriptPath], { encoding: "utf-8", cwd: tmpDir });
    assert.ok(output.includes("Nothing to migrate"));
  });
});
