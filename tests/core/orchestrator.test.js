// tests/core/orchestrator.test.js
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPlugin, scanArchive } from "../../src/core/orchestrator.js";

describe("scanArchive", () => {
  const tmpDir = join(import.meta.dirname, ".tmp-scan-test");

  beforeEach(() => mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("returns empty sets when archive does not exist", () => {
    const { archivedIds, latestByAuthor } = scanArchive(tmpDir, "nope");
    assert.strictEqual(archivedIds.size, 0);
    assert.deepStrictEqual(latestByAuthor, {});
  });

  test("collects ids and latest timestamps from .as2.json files", () => {
    const postsDir = join(tmpDir, "testplatform", "posts", "alice");
    mkdirSync(postsDir, { recursive: true });

    writeFileSync(join(postsDir, "2024-01-01-a.as2.json"), JSON.stringify({
      id: "https://example.com/p/A/",
      published: "2024-01-01T00:00:00.000Z",
    }));
    writeFileSync(join(postsDir, "2024-06-15-b.as2.json"), JSON.stringify({
      id: "https://example.com/p/B/",
      published: "2024-06-15T12:00:00.000Z",
    }));

    const { archivedIds, latestByAuthor } = scanArchive(tmpDir, "testplatform");

    assert.ok(archivedIds.has("https://example.com/p/A/"));
    assert.ok(archivedIds.has("https://example.com/p/B/"));
    assert.strictEqual(archivedIds.size, 2);
    assert.strictEqual(latestByAuthor.alice, "2024-06-15T12:00:00.000Z");
  });

  test("tracks latest per author across multiple authors", () => {
    for (const [author, pub] of [["alice", "2024-03-01T00:00:00.000Z"], ["bob", "2024-05-01T00:00:00.000Z"]]) {
      const dir = join(tmpDir, "tp", "posts", author);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "post.as2.json"), JSON.stringify({ id: `id:${author}`, published: pub }));
    }

    const { latestByAuthor } = scanArchive(tmpDir, "tp");
    assert.strictEqual(latestByAuthor.alice, "2024-03-01T00:00:00.000Z");
    assert.strictEqual(latestByAuthor.bob, "2024-05-01T00:00:00.000Z");
  });

  test("skips malformed JSON files", () => {
    const postsDir = join(tmpDir, "tp", "posts", "alice");
    mkdirSync(postsDir, { recursive: true });
    writeFileSync(join(postsDir, "bad.as2.json"), "not json{{{");
    writeFileSync(join(postsDir, "good.as2.json"), JSON.stringify({ id: "good", published: "2024-01-01T00:00:00.000Z" }));

    const { archivedIds } = scanArchive(tmpDir, "tp");
    assert.strictEqual(archivedIds.size, 1);
    assert.ok(archivedIds.has("good"));
  });
});

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
        };
      },
    };

    await runPlugin(fakePlugin, {}, archiveDir);

    const as2Path = join(archiveDir, "testplatform", "posts", "testuser", "2024-03-15-ABC123.as2.json");
    const rawPath = join(archiveDir, "testplatform", "posts", "testuser", "2024-03-15-ABC123.raw.json");

    assert.ok(existsSync(as2Path), "AS2 file should exist");
    assert.ok(existsSync(rawPath), "Raw file should exist");

    const as2 = JSON.parse(readFileSync(as2Path, "utf-8"));
    assert.strictEqual(as2["@context"], "https://www.w3.org/ns/activitystreams");
    assert.strictEqual(as2.type, "Note");
    assert.strictEqual(as2.generator.name, "Testplatform");

    const raw = JSON.parse(readFileSync(rawPath, "utf-8"));
    assert.strictEqual(raw.original, "data");
  });

  test("passes archivedIds and latestByAuthor from existing archive to plugin", async () => {
    // Pre-populate archive with an existing post
    const postsDir = join(archiveDir, "testplatform", "posts", "testuser");
    mkdirSync(postsDir, { recursive: true });
    writeFileSync(join(postsDir, "2024-01-01-OLD.as2.json"), JSON.stringify({
      id: "https://example.com/p/OLD/",
      published: "2024-01-01T00:00:00.000Z",
    }));

    let receivedArchivedIds = null;
    let receivedLatestByAuthor = null;
    const fakePlugin = {
      name: "testplatform",
      async run(config, context) {
        receivedArchivedIds = context.archivedIds;
        receivedLatestByAuthor = context.latestByAuthor;
        return { posts: [] };
      },
    };

    await runPlugin(fakePlugin, {}, archiveDir);

    assert.ok(receivedArchivedIds instanceof Set);
    assert.ok(receivedArchivedIds.has("https://example.com/p/OLD/"));
    assert.strictEqual(receivedLatestByAuthor.testuser, "2024-01-01T00:00:00.000Z");
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
        return { posts: [] };
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
        };
      },
    };

    await runPlugin(fakePlugin, {}, archiveDir);

    const as2Path = join(archiveDir, "testplatform", "posts", "testuser", "2025-01-20-my-slug.as2.json");
    assert.ok(existsSync(as2Path), "Filename should be derived from AS2 id URL slug");
  });
});
