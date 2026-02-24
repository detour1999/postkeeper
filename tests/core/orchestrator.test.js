// tests/core/orchestrator.test.js
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPoll } from "../../src/core/orchestrator.js";

describe("runPoll", () => {
  const tmpDir = join(import.meta.dirname, ".tmp-orchestrator-test");
  const archiveDir = join(tmpDir, "archive");

  beforeEach(() => mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("writes AS2 and raw JSON for each post returned by plugin", async () => {
    const fakePlugin = {
      name: "testplatform",
      async poll(config, context) {
        return {
          posts: [
            {
              activity: {
                shortcode: "ABC123",
                url: "https://example.com/p/ABC123/",
                id: "1",
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
              },
              raw: { original: "data", id: "abc" },
              media: [],
            },
          ],
          state: { lastSeen: "2024-03-15T14:30:00.000Z" },
        };
      },
    };

    await runPoll(fakePlugin, {}, archiveDir);

    const as2Path = join(archiveDir, "testplatform", "posts", "testuser", "2024-03-15-ABC123.as2.json");
    const rawPath = join(archiveDir, "testplatform", "posts", "testuser", "2024-03-15-ABC123.raw.json");
    const statePath = join(archiveDir, "testplatform", "state.json");

    assert.ok(existsSync(as2Path), "AS2 file should exist");
    assert.ok(existsSync(rawPath), "Raw file should exist");
    assert.ok(existsSync(statePath), "State file should exist");

    const as2 = JSON.parse(readFileSync(as2Path, "utf-8"));
    assert.strictEqual(as2["@context"], "https://www.w3.org/ns/activitystreams");
    assert.strictEqual(as2.type, "Note");
    assert.strictEqual(as2.generator.name, "Testplatform");

    const raw = JSON.parse(readFileSync(rawPath, "utf-8"));
    assert.strictEqual(raw.original, "data");

    const state = JSON.parse(readFileSync(statePath, "utf-8"));
    assert.strictEqual(state.lastSeen, "2024-03-15T14:30:00.000Z");
  });

  test("passes existing state to plugin", async () => {
    const stateDir = join(archiveDir, "testplatform");
    mkdirSync(stateDir, { recursive: true });
    const statePath = join(stateDir, "state.json");
    const existingState = { lastSeen: "2024-01-01T00:00:00.000Z" };
    writeFileSync(statePath, JSON.stringify(existingState));

    let receivedState = null;
    const fakePlugin = {
      name: "testplatform",
      async poll(config, context) {
        receivedState = context.state;
        return { posts: [], state: existingState };
      },
    };

    await runPoll(fakePlugin, {}, archiveDir);
    assert.deepStrictEqual(receivedState, existingState);
  });

  test("moves media files from tmpPath to archive", async () => {
    const fakeTmpDir = join(tmpDir, "tmp-media");
    mkdirSync(fakeTmpDir, { recursive: true });
    writeFileSync(join(fakeTmpDir, "1.jpg"), "fake image data");

    const fakePlugin = {
      name: "testplatform",
      async poll(config, context) {
        return {
          posts: [
            {
              activity: {
                shortcode: "IMG001",
                url: "https://example.com/p/IMG001/",
                id: "2",
                username: "testuser",
                timestamp: "2024-06-01T12:00:00.000Z",
                caption: "photo",
                location: null,
                tagged_users: [],
                alt_text: null,
                likes: 0,
                comments: 0,
                media_type: "image",
                media: [{ type: "image", url: "https://example.com/img.jpg", file: "1.jpg" }],
              },
              raw: {},
              media: [{ relativePath: "1.jpg", tmpPath: join(fakeTmpDir, "1.jpg") }],
            },
          ],
          state: {},
        };
      },
    };

    await runPoll(fakePlugin, {}, archiveDir);

    const mediaPath = join(archiveDir, "testplatform", "posts", "testuser", "2024-06-01-IMG001", "1.jpg");
    assert.ok(existsSync(mediaPath), "Media file should be moved to archive");
    assert.strictEqual(readFileSync(mediaPath, "utf-8"), "fake image data");
  });
});
