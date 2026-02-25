// tests/core/orchestrator.test.js
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPlugin } from "../../src/core/orchestrator.js";

describe("runPlugin", () => {
  const tmpDir = join(import.meta.dirname, ".tmp-orchestrator-test");
  const archiveDir = join(tmpDir, "archive");
  let origDataDir;

  beforeEach(() => {
    origDataDir = process.env.POSTKEEPER_DATA_DIR;
    process.env.POSTKEEPER_DATA_DIR = join(tmpDir, "data");
    mkdirSync(tmpDir, { recursive: true });
  });
  afterEach(() => {
    if (origDataDir === undefined) {
      delete process.env.POSTKEEPER_DATA_DIR;
    } else {
      process.env.POSTKEEPER_DATA_DIR = origDataDir;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeAS2(overrides = {}) {
    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Note",
      id: "https://example.com/p/ABC123/",
      url: "https://example.com/p/ABC123/",
      published: "2024-03-15T14:30:00.000Z",
      attributedTo: { type: "Person", name: "testuser", url: "https://example.com/testuser/" },
      content: "Hello",
      attachment: [{ type: "Image", mediaType: "image/jpeg", url: "1.jpg" }],
      tag: [],
      likes: { type: "Collection", totalItems: 10 },
      replies: { type: "Collection", totalItems: 2 },
      generator: { type: "Application", name: "Testplatform" },
      ...overrides,
    };
  }

  test("writes AS2 and raw JSON for each post returned by plugin", async () => {
    const fakePlugin = {
      name: "testplatform",
      async run() {
        return {
          posts: [
            {
              as2: makeAS2(),
              raw: { original: "data", id: "abc" },
              media: [],
            },
          ],
          state: { lastSeen: "2024-03-15T14:30:00.000Z" },
        };
      },
    };

    await runPlugin(fakePlugin, {}, archiveDir);

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
      async run(config, context) {
        receivedState = context.state;
        return { posts: [], state: existingState };
      },
    };

    await runPlugin(fakePlugin, {}, archiveDir);
    assert.deepStrictEqual(receivedState, existingState);
  });

  test("moves media files from tmpPath to archive", async () => {
    const fakeTmpDir = join(tmpDir, "tmp-media");
    mkdirSync(fakeTmpDir, { recursive: true });
    writeFileSync(join(fakeTmpDir, "1.jpg"), "fake image data");

    const fakePlugin = {
      name: "testplatform",
      async run() {
        return {
          posts: [
            {
              as2: makeAS2({
                id: "https://example.com/p/IMG001/",
                published: "2024-06-01T12:00:00.000Z",
                content: "photo",
              }),
              raw: {},
              media: [{ relativePath: "1.jpg", tmpPath: join(fakeTmpDir, "1.jpg") }],
            },
          ],
          state: {},
        };
      },
    };

    await runPlugin(fakePlugin, {}, archiveDir);

    const mediaPath = join(archiveDir, "testplatform", "posts", "testuser", "2024-06-01-IMG001", "1.jpg");
    assert.ok(existsSync(mediaPath), "Media file should be moved to archive");
    assert.strictEqual(readFileSync(mediaPath, "utf-8"), "fake image data");
  });

  test("skips posts with invalid AS2", async () => {
    const fakePlugin = {
      name: "testplatform",
      async run() {
        return {
          posts: [
            {
              as2: { type: "Note" }, // missing @context, id, published, attributedTo
              raw: { id: "bad" },
              media: [],
            },
            {
              as2: makeAS2({ id: "https://example.com/p/GOOD001/" }),
              raw: { id: "good" },
              media: [],
            },
          ],
          state: {},
        };
      },
    };

    await runPlugin(fakePlugin, {}, archiveDir);

    // The bad post should not be written
    const badPath = join(archiveDir, "testplatform", "posts", "testuser", "undefined-Note.as2.json");
    assert.ok(!existsSync(badPath), "Invalid AS2 post should not be written");

    // The good post should be written
    const goodPath = join(archiveDir, "testplatform", "posts", "testuser", "2024-03-15-GOOD001.as2.json");
    assert.ok(existsSync(goodPath), "Valid AS2 post should be written");
  });

  test("derives filename from non-URL id with colon separators", async () => {
    const fakePlugin = {
      name: "testplatform",
      async run() {
        return {
          posts: [
            {
              as2: makeAS2({
                id: "meta-archive:instagram:18035531567732190",
                published: "2025-12-26T02:36:17.000Z",
              }),
              raw: {},
              media: [],
            },
          ],
          state: {},
        };
      },
    };

    await runPlugin(fakePlugin, {}, archiveDir);

    // meta-archive: is a valid URL scheme, so pathname is "instagram:18035531567732190"
    // After sanitization, colons become hyphens
    const as2Path = join(archiveDir, "testplatform", "posts", "testuser", "2025-12-26-instagram-18035531567732190.as2.json");
    assert.ok(existsSync(as2Path), "Should sanitize colons in derived filename");
  });

  test("passes dataDir in context", async () => {
    let receivedDataDir = null;
    const fakePlugin = {
      name: "testplatform",
      async run(config, context) {
        receivedDataDir = context.dataDir;
        return { posts: [], state: {} };
      },
    };
    await runPlugin(fakePlugin, {}, archiveDir);
    assert.ok(receivedDataDir);
    assert.ok(receivedDataDir.includes("testplatform"));
  });

  test("derives filename from AS2 id URL", async () => {
    const fakePlugin = {
      name: "testplatform",
      async run() {
        return {
          posts: [
            {
              as2: makeAS2({
                id: "https://example.com/posts/my-slug/",
                published: "2025-01-20T10:00:00.000Z",
              }),
              raw: {},
              media: [],
            },
          ],
          state: {},
        };
      },
    };

    await runPlugin(fakePlugin, {}, archiveDir);

    const as2Path = join(archiveDir, "testplatform", "posts", "testuser", "2025-01-20-my-slug.as2.json");
    assert.ok(existsSync(as2Path), "Filename should be derived from AS2 id URL slug");
  });
});
