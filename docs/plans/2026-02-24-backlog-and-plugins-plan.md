# Backlog Cleanup & New Plugins Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Address all BACKLOG items (except Distribution), refactor core to decouple from Instagram, and add RSS and Meta archive plugins.

**Architecture:** Thin core validates AS2 and manages storage. Fat plugins own everything platform-specific including AS2 conversion. Each plugin can have its own `package.json` for dependencies.

**Tech Stack:** Node.js >=20.11, ES modules, node:test, fast-xml-parser (RSS plugin), adm-zip (Meta plugin)

**Design doc:** `docs/plans/2026-02-24-backlog-and-plugins-design.md`

---

### Task 1: Rename `poll` to `run`

Mechanical rename of the command and method name across the codebase.

**Files:**
- Modify: `src/cli.js` (lines 71-116: rename command from "poll" to "run", update descriptions and log messages)
- Modify: `src/core/orchestrator.js` (line 22: rename `runPoll` to `runPlugin`)
- Modify: `src/core/plugins.js` (line 21: change `plugin.poll` check to `plugin.run`)
- Modify: `plugins/instagram/index.js` (line 64: rename `poll` method to `run`)
- Modify: `tests/cli.test.js` (lines 15, 40-46: update "poll" references to "run")
- Modify: `tests/core/orchestrator.test.js` (lines 6, 46, 84, 123: update `runPoll` to `runPlugin`)
- Modify: `tests/core/plugins.test.js` (lines 19, 23: update `poll` to `run` in fake plugin)
- Modify: `scripts/migrate-from-instapost.js` (no change needed - doesn't reference poll)

**Step 1: Update orchestrator export name**

In `src/core/orchestrator.js`, rename:
```js
// line 22
export async function runPlugin(plugin, pluginConfig, archiveDir) {
```
And on line 32:
```js
  const result = await plugin.run(pluginConfig, context);
```

**Step 2: Update plugin loader validation**

In `src/core/plugins.js`, line 21:
```js
if (!plugin?.name || typeof plugin.run !== "function" || typeof plugin.init !== "function") {
  console.warn(`Skipping plugin "${entry.name}": missing required exports (name, init, run)`);
```

**Step 3: Update Instagram plugin**

In `plugins/instagram/index.js`, line 64:
```js
  async run(config, context) {
```

**Step 4: Update CLI**

In `src/cli.js`:
- Line 7: `import { runPlugin } from "./core/orchestrator.js";`
- Lines 71-116: Replace entire `poll` command block with `run` command:
```js
program
  .command("run [plugin]")
  .description("Run plugins to fetch/import posts")
  .action(async (pluginName) => {
    // ... same body but with "run" in messages and using runPlugin
  });
```

**Step 5: Update all tests**

In `tests/cli.test.js`:
- Line 15: `assert.ok(output.includes("run"));`
- Lines 40-46: rename test to "run with unknown plugin fails", use `"run"` arg

In `tests/core/orchestrator.test.js`:
- Line 6: `import { runPlugin } from "../../src/core/orchestrator.js";`
- Lines 18, 78, 95: change `poll` to `run` in fake plugin objects
- Lines 46, 84, 123: change `runPoll` to `runPlugin`

In `tests/core/plugins.test.js`:
- Lines 19, 23: change `poll` to `run` in fake plugin string

**Step 6: Run tests**

Run: `npm test`
Expected: All 28 tests pass

**Step 7: Commit**

```bash
git add src/ plugins/instagram/index.js tests/
git commit -m "refactor: rename poll to run for generic plugin commands"
```

---

### Task 2: Fix cwd-Relative Paths

The CLI uses `resolve("plugins")` and `loadConfig("config.json")` which only work from the project root. Fix by deriving project root from `import.meta.dirname`.

**Files:**
- Modify: `src/cli.js` (lines 4, 20, 34-35, 48-49, 75-77)
- Modify: `tests/cli.test.js` (update tests to work from any cwd)

**Step 1: Add project root constant in CLI**

At the top of `src/cli.js`, after imports, add:
```js
import { resolve, join, dirname } from "node:path";

const PROJECT_ROOT = dirname(import.meta.dirname);
const CONFIG_PATH = join(PROJECT_ROOT, "config.json");
const PLUGINS_DIR = join(PROJECT_ROOT, "plugins");
```

**Step 2: Replace all `resolve("plugins")` and `loadConfig("config.json")`**

Replace every occurrence:
- `resolve("plugins")` → `PLUGINS_DIR`
- `loadConfig("config.json")` → `loadConfig(CONFIG_PATH)`
- `resolve(config.archive_dir)` → `resolve(PROJECT_ROOT, config.archive_dir)`

**Step 3: Update CLI tests to run from a different cwd**

In `tests/cli.test.js`, remove the `cwd` option from execFileSync calls (they should work from any directory now). Add a test that runs from `/tmp`:

```js
test("works from a different working directory", () => {
  const output = execFileSync("node", [cli, "list"], { encoding: "utf-8", cwd: "/tmp" });
  assert.ok(output.includes("instagram"));
});
```

**Step 4: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/cli.js tests/cli.test.js
git commit -m "fix: resolve config and plugins relative to project root, not cwd"
```

---

### Task 3: Fix Downloader Logging

Replace `console.log`/`console.error` with an optional `log` parameter.

**Files:**
- Modify: `plugins/instagram/downloader.js` (lines 6, 15, 20)
- Modify: `plugins/instagram/index.js` (line 109: pass log to downloadMedia)
- Modify: `tests/plugins/instagram/downloader.test.js`

**Step 1: Write failing test for log parameter**

Add to `tests/plugins/instagram/downloader.test.js`:
```js
test("uses provided log function instead of console", async () => {
  const logs = [];
  const log = (msg) => logs.push(msg);
  const mediaItems = [
    { file: "image1.jpg", url: `${baseUrl}/image1.jpg` },
  ];

  await downloadMedia(mediaItems, tmpDir, "LOG001", log);

  assert.ok(logs.some((m) => m.includes("image1.jpg")));
});

test("uses provided log function for errors", async () => {
  const logs = [];
  const log = (msg) => logs.push(msg);
  const mediaItems = [
    { file: "missing.jpg", url: `${baseUrl}/missing.jpg` },
  ];

  await downloadMedia(mediaItems, tmpDir, "ERR001", log);

  assert.ok(logs.some((m) => m.includes("Failed") || m.includes("404")));
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: New tests fail (downloadMedia doesn't accept log param yet)

**Step 3: Update downloadMedia signature**

In `plugins/instagram/downloader.js`:
```js
export async function downloadMedia(mediaItems, tmpDir, shortcode, log = console.log) {
```

Line 15: Replace `console.error(...)` with `log(...)`:
```js
      log(`  Failed to download ${item.url}: ${response.status}`);
```

Line 20: Replace `console.log(...)` with `log(...)`:
```js
    log(`  Downloaded: ${item.file}`);
```

**Step 4: Update Instagram plugin to pass context.log**

In `plugins/instagram/index.js`, line 109:
```js
const mediaFiles = await downloadMedia(postData.media, context.tmpDir, shortcode, context.log);
```

**Step 5: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add plugins/instagram/ tests/plugins/instagram/downloader.test.js
git commit -m "fix: use context.log in downloader instead of console.log"
```

---

### Task 4: AS2 Validation + Move Conversion to Plugins + Derive Filenames

This is the big architectural change. Core stops converting to AS2 and instead validates what plugins return. Plugins return fully-formed AS2 objects. Orchestrator derives filenames from AS2 fields instead of Instagram-specific fields.

**Files:**
- Create: `plugins/instagram/as2.js` (move toAS2 from core, make Instagram-specific)
- Replace: `src/core/as2.js` (replace toAS2 with validateAS2)
- Modify: `src/core/orchestrator.js` (use validateAS2, derive filenames from AS2)
- Modify: `plugins/instagram/index.js` (import and call toAS2 in the plugin)
- Create: `tests/plugins/instagram/as2.test.js` (move existing tests)
- Rewrite: `tests/core/as2.test.js` (test validateAS2 instead)
- Modify: `tests/core/orchestrator.test.js` (plugins now return AS2 objects)
- Modify: `scripts/migrate-from-instapost.js` (import from new location)

**Step 1: Write validateAS2 tests**

Replace `tests/core/as2.test.js` entirely:

```js
// tests/core/as2.test.js
import { test, describe } from "node:test";
import assert from "node:assert";
import { validateAS2 } from "../../src/core/as2.js";

describe("validateAS2", () => {
  const validAS2 = {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Note",
    id: "https://www.instagram.com/p/ABC123/",
    published: "2024-03-15T14:30:00.000Z",
    attributedTo: { type: "Person", name: "testuser" },
    content: "Hello",
  };

  test("returns true for a valid AS2 object", () => {
    const result = validateAS2(validAS2);
    assert.strictEqual(result.valid, true);
  });

  test("rejects missing @context", () => {
    const { "@context": _, ...obj } = validAS2;
    const result = validateAS2(obj);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("@context"));
  });

  test("rejects wrong @context", () => {
    const result = validateAS2({ ...validAS2, "@context": "wrong" });
    assert.strictEqual(result.valid, false);
  });

  test("rejects missing type", () => {
    const { type: _, ...obj } = validAS2;
    const result = validateAS2(obj);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("type"));
  });

  test("rejects missing id", () => {
    const { id: _, ...obj } = validAS2;
    const result = validateAS2(obj);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("id"));
  });

  test("rejects missing published", () => {
    const { published: _, ...obj } = validAS2;
    const result = validateAS2(obj);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("published"));
  });

  test("rejects missing attributedTo", () => {
    const { attributedTo: _, ...obj } = validAS2;
    const result = validateAS2(obj);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("attributedTo"));
  });

  test("rejects attributedTo without name", () => {
    const result = validateAS2({ ...validAS2, attributedTo: { type: "Person" } });
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("attributedTo.name"));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: Fails because `validateAS2` doesn't exist yet

**Step 3: Implement validateAS2**

Replace `src/core/as2.js`:

```js
// src/core/as2.js

const AS2_CONTEXT = "https://www.w3.org/ns/activitystreams";

export function validateAS2(obj) {
  if (!obj || typeof obj !== "object") {
    return { valid: false, error: "AS2 object is required" };
  }
  if (obj["@context"] !== AS2_CONTEXT) {
    return { valid: false, error: `@context must be "${AS2_CONTEXT}"` };
  }
  if (typeof obj.type !== "string") {
    return { valid: false, error: "type must be a string" };
  }
  if (typeof obj.id !== "string") {
    return { valid: false, error: "id must be a string" };
  }
  if (typeof obj.published !== "string") {
    return { valid: false, error: "published must be a string" };
  }
  if (!obj.attributedTo || typeof obj.attributedTo !== "object") {
    return { valid: false, error: "attributedTo must be an object" };
  }
  if (typeof obj.attributedTo.name !== "string") {
    return { valid: false, error: "attributedTo.name must be a string" };
  }
  return { valid: true };
}
```

**Step 4: Run AS2 tests**

Run: `node --test tests/core/as2.test.js`
Expected: All 7 validateAS2 tests pass

**Step 5: Create Instagram AS2 converter**

Create `plugins/instagram/as2.js`:

```js
// plugins/instagram/as2.js

function mediaTypeToAS2(type) {
  if (type === "video") return { type: "Video", mediaType: "video/mp4" };
  return { type: "Image", mediaType: "image/jpeg" };
}

export function toAS2(post) {
  const as2 = {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Note",
    id: `https://www.instagram.com/p/${post.shortcode}/`,
    url: `https://www.instagram.com/p/${post.shortcode}/`,
    published: post.timestamp,
    attributedTo: {
      type: "Person",
      name: post.username,
      url: `https://www.instagram.com/${post.username}/`,
    },
    content: post.caption,
    attachment: post.media.map((m, i) => {
      const base = mediaTypeToAS2(m.type);
      const obj = { ...base, url: m.file };
      if (i === 0 && post.alt_text) {
        obj.name = post.alt_text;
      }
      return obj;
    }),
    tag: (post.tagged_users || []).map((u) => ({
      type: "Mention",
      href: `https://www.instagram.com/${u}/`,
      name: `@${u}`,
    })),
    likes: { type: "Collection", totalItems: post.likes || 0 },
    replies: { type: "Collection", totalItems: post.comments || 0 },
    generator: { type: "Application", name: "Instagram" },
  };

  if (post.location) {
    as2.location = { type: "Place", name: post.location.name };
  }

  return as2;
}
```

**Step 6: Create Instagram AS2 tests**

Create `tests/plugins/instagram/as2.test.js`:

```js
// tests/plugins/instagram/as2.test.js
import { test, describe } from "node:test";
import assert from "node:assert";
import { toAS2 } from "../../../plugins/instagram/as2.js";

describe("Instagram toAS2", () => {
  test("converts an image post to AS2", () => {
    const post = {
      shortcode: "ABC123",
      url: "https://www.instagram.com/p/ABC123/",
      id: "12345",
      username: "testuser",
      timestamp: "2024-03-15T14:30:00.000Z",
      caption: "Hello world",
      location: { name: "Portland", id: "99" },
      tagged_users: ["friend1"],
      alt_text: "A sunset photo",
      likes: 42,
      comments: 3,
      media_type: "image",
      media: [{ type: "image", url: "https://cdn.example.com/img.jpg", file: "1.jpg" }],
    };

    const as2 = toAS2(post);

    assert.strictEqual(as2["@context"], "https://www.w3.org/ns/activitystreams");
    assert.strictEqual(as2.type, "Note");
    assert.strictEqual(as2.id, "https://www.instagram.com/p/ABC123/");
    assert.strictEqual(as2.published, "2024-03-15T14:30:00.000Z");
    assert.strictEqual(as2.content, "Hello world");
    assert.strictEqual(as2.attributedTo.name, "testuser");
    assert.strictEqual(as2.attributedTo.url, "https://www.instagram.com/testuser/");
    assert.strictEqual(as2.attachment.length, 1);
    assert.strictEqual(as2.attachment[0].type, "Image");
    assert.strictEqual(as2.attachment[0].url, "1.jpg");
    assert.strictEqual(as2.attachment[0].name, "A sunset photo");
    assert.strictEqual(as2.location.name, "Portland");
    assert.strictEqual(as2.tag[0].href, "https://www.instagram.com/friend1/");
    assert.strictEqual(as2.generator.name, "Instagram");
  });

  test("converts a carousel post", () => {
    const post = {
      shortcode: "XYZ789",
      username: "testuser",
      timestamp: "2024-03-15T14:30:00.000Z",
      caption: "Carousel!",
      location: null,
      tagged_users: [],
      alt_text: null,
      likes: 5,
      comments: 1,
      media: [
        { type: "image", file: "1.jpg" },
        { type: "image", file: "2.jpg" },
        { type: "video", file: "3.mp4" },
      ],
    };

    const as2 = toAS2(post);
    assert.strictEqual(as2.attachment.length, 3);
    assert.strictEqual(as2.attachment[2].type, "Video");
    assert.strictEqual(as2.attachment[2].mediaType, "video/mp4");
  });

  test("converts a video post", () => {
    const post = {
      shortcode: "VID111",
      username: "testuser",
      timestamp: "2024-03-15T14:30:00.000Z",
      caption: "",
      location: null,
      tagged_users: [],
      alt_text: null,
      likes: 0,
      comments: 0,
      media: [{ type: "video", file: "1.mp4" }],
    };

    const as2 = toAS2(post);
    assert.strictEqual(as2.attachment[0].type, "Video");
    assert.strictEqual(as2.attachment[0].mediaType, "video/mp4");
  });
});
```

**Step 7: Run Instagram AS2 tests**

Run: `node --test tests/plugins/instagram/as2.test.js`
Expected: All 3 tests pass

**Step 8: Update Instagram plugin to return AS2**

In `plugins/instagram/index.js`, add import at top:
```js
import { toAS2 } from "./as2.js";
```

In the `run` method (was `poll`), around line 111, change the post assembly:
```js
            const as2 = toAS2(postData);

            allPosts.push({
              as2,
              raw: rawNode,
              media: mediaFiles,
            });
```

**Step 9: Update orchestrator to validate AS2 and derive filenames**

Replace `src/core/orchestrator.js`:

```js
// src/core/orchestrator.js
import { mkdirSync, writeFileSync, renameSync, copyFileSync, unlinkSync, existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { validateAS2 } from "./as2.js";

function loadPluginState(archiveDir, pluginName) {
  const statePath = join(archiveDir, pluginName, "state.json");
  try {
    return JSON.parse(readFileSync(statePath, "utf-8"));
  } catch {
    return {};
  }
}

function savePluginState(archiveDir, pluginName, state) {
  const statePath = join(archiveDir, pluginName, "state.json");
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function deriveBaseName(as2) {
  const datePrefix = as2.published.slice(0, 10);
  let slug;
  try {
    const url = new URL(as2.id);
    const segments = url.pathname.split("/").filter(Boolean);
    slug = segments[segments.length - 1];
  } catch {
    slug = as2.id;
  }
  return `${datePrefix}-${slug}`;
}

export async function runPlugin(plugin, pluginConfig, archiveDir) {
  const state = loadPluginState(archiveDir, plugin.name);
  const tmpDir = mkdtempSync(join(tmpdir(), `postkeeper-${plugin.name}-`));

  const context = {
    state,
    tmpDir,
    log: (msg) => console.log(`  [${plugin.name}] ${msg}`),
  };

  const result = await plugin.run(pluginConfig, context);

  for (const post of result.posts) {
    const { as2, raw, media } = post;

    // Validate AS2
    const validation = validateAS2(as2);
    if (!validation.valid) {
      context.log(`Skipping post: invalid AS2 - ${validation.error}`);
      continue;
    }

    const baseName = deriveBaseName(as2);
    const postDir = join(archiveDir, plugin.name, "posts", as2.attributedTo.name);

    // Write AS2 JSON
    const as2Path = join(postDir, `${baseName}.as2.json`);
    mkdirSync(dirname(as2Path), { recursive: true });
    writeFileSync(as2Path, JSON.stringify(as2, null, 2));

    // Write raw JSON
    const rawPath = join(postDir, `${baseName}.raw.json`);
    writeFileSync(rawPath, JSON.stringify(raw, null, 2));

    // Move media files
    if (media && media.length > 0) {
      const mediaDir = join(postDir, baseName);
      mkdirSync(mediaDir, { recursive: true });
      for (const m of media) {
        if (m.tmpPath && existsSync(m.tmpPath)) {
          try {
            renameSync(m.tmpPath, join(mediaDir, m.relativePath));
          } catch {
            copyFileSync(m.tmpPath, join(mediaDir, m.relativePath));
            unlinkSync(m.tmpPath);
          }
        }
      }
    }
  }

  savePluginState(archiveDir, plugin.name, result.state);
  rmSync(tmpDir, { recursive: true, force: true });
}
```

**Step 10: Update orchestrator tests**

Update `tests/core/orchestrator.test.js` to have plugins return AS2 objects instead of `activity`:

```js
// tests/core/orchestrator.test.js
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPlugin } from "../../src/core/orchestrator.js";

describe("runPlugin", () => {
  const tmpDir = join(import.meta.dirname, ".tmp-orchestrator-test");
  const archiveDir = join(tmpDir, "archive");

  beforeEach(() => mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("writes AS2 and raw JSON for each post returned by plugin", async () => {
    const fakePlugin = {
      name: "testplatform",
      async run(config, context) {
        return {
          posts: [
            {
              as2: {
                "@context": "https://www.w3.org/ns/activitystreams",
                type: "Note",
                id: "https://example.com/p/ABC123/",
                url: "https://example.com/p/ABC123/",
                published: "2024-03-15T14:30:00.000Z",
                attributedTo: { type: "Person", name: "testuser" },
                content: "Hello",
                attachment: [],
                generator: { type: "Application", name: "Testplatform" },
              },
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
      async run(config, context) {
        return {
          posts: [
            {
              as2: {
                "@context": "https://www.w3.org/ns/activitystreams",
                type: "Note",
                id: "https://example.com/p/IMG001/",
                published: "2024-06-01T12:00:00.000Z",
                attributedTo: { type: "Person", name: "testuser" },
                content: "photo",
              },
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
      async run(config, context) {
        return {
          posts: [
            {
              as2: { type: "Note" }, // missing required fields
              raw: {},
              media: [],
            },
          ],
          state: {},
        };
      },
    };

    await runPlugin(fakePlugin, {}, archiveDir);

    // No files should be written
    assert.ok(!existsSync(join(archiveDir, "testplatform", "posts")));
  });
});
```

**Step 11: Update migration script**

In `scripts/migrate-from-instapost.js`, line 13:
```js
import { toAS2 } from "../plugins/instagram/as2.js";
```

**Step 12: Run all tests**

Run: `npm test`
Expected: All tests pass (count should increase due to new tests)

**Step 13: Commit**

```bash
git add src/core/as2.js src/core/orchestrator.js plugins/instagram/as2.js plugins/instagram/index.js tests/ scripts/
git commit -m "refactor: plugins own AS2 conversion, core validates and derives filenames"
```

---

### Task 5: Plugin Dependency Management

Add support for plugin-level `package.json` files. The `init` command runs `npm install` inside the plugin directory if a `package.json` exists.

**Files:**
- Modify: `src/cli.js` (init command: add npm install step)
- Create: `plugins/instagram/package.json` (move playwright dep here)
- Modify: root `package.json` (remove playwright from root deps)

**Step 1: Update init command in CLI**

In `src/cli.js`, in the `init` action, before calling `plugin.init()`, add:
```js
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

// In the init action:
    const pluginDir = join(PLUGINS_DIR, pluginName);
    const pluginPkgJson = join(pluginDir, "package.json");
    if (existsSync(pluginPkgJson)) {
      console.log(`Installing dependencies for ${pluginName}...`);
      execFileSync("npm", ["install"], { cwd: pluginDir, stdio: "inherit" });
    }
    await plugin.init(config.plugins[pluginName] || {});
```

**Step 2: Create Instagram plugin package.json**

Create `plugins/instagram/package.json`:
```json
{
  "private": true,
  "dependencies": {
    "playwright": "^1.58.2"
  }
}
```

**Step 3: Remove playwright from root package.json**

Remove `"playwright": "^1.58.2"` from root `package.json` dependencies.

**Step 4: Add `plugins/*/node_modules/` to .gitignore**

Append to `.gitignore`:
```
plugins/*/node_modules/
```

**Step 5: Run npm install in instagram plugin dir**

Run: `npm install --prefix plugins/instagram`

**Step 6: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 7: Update coverage exclusion**

In root `package.json`, update the `test:coverage` script to also exclude plugin node_modules:
```json
"test:coverage": "c8 --check-coverage --lines 90 --branches 80 --functions 80 --exclude='plugins/instagram/index.js' --exclude='src/cli.js' --exclude='tests/**' --exclude='plugins/*/node_modules/**' node --test"
```

**Step 8: Commit**

```bash
git add plugins/instagram/package.json package.json .gitignore src/cli.js
git commit -m "feat: support plugin-level package.json with npm install on init"
```

---

### Task 6: Migration Script Tests

Add tests for `scripts/migrate-from-instapost.js` (BACKLOG item).

**Files:**
- Create: `tests/scripts/migrate.test.js`

**Step 1: Write migration tests**

The migration script is a standalone script that reads from `output/posts/` and writes to `archive/instagram/posts/`. We'll test the core logic by creating a temp directory with the expected structure.

Create `tests/scripts/migrate.test.js`:

```js
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
```

**Step 2: Run tests**

Run: `npm test`
Expected: All tests pass (migration tests will exercise the migration script with the updated import from `plugins/instagram/as2.js`)

**Step 3: Commit**

```bash
git add tests/scripts/
git commit -m "test: add tests for migrate-from-instapost script"
```

---

### Task 7: RSS/Atom Plugin

Create the RSS plugin with feed parsing, enclosure downloading, and AS2 conversion.

**Files:**
- Create: `plugins/rss/package.json`
- Create: `plugins/rss/index.js`
- Create: `plugins/rss/parser.js`
- Create: `tests/plugins/rss/parser.test.js`
- Create: `tests/fixtures/rss-feed.xml`
- Create: `tests/fixtures/atom-feed.xml`

**Step 1: Create test fixtures**

Create `tests/fixtures/rss-feed.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Test Blog</title>
    <link>https://example.com</link>
    <item>
      <title>First Post</title>
      <link>https://example.com/posts/first</link>
      <description>Short summary</description>
      <content:encoded><![CDATA[<p>Full content here</p>]]></content:encoded>
      <pubDate>Sat, 15 Mar 2024 14:30:00 GMT</pubDate>
      <dc:creator>Alice</dc:creator>
      <category>Tech</category>
      <category>Node.js</category>
      <enclosure url="https://example.com/audio.mp3" length="1234" type="audio/mpeg" />
    </item>
    <item>
      <title>Second Post</title>
      <link>https://example.com/posts/second</link>
      <description>Another post</description>
      <pubDate>Mon, 10 Mar 2024 10:00:00 GMT</pubDate>
      <dc:creator>Bob</dc:creator>
    </item>
  </channel>
</rss>
```

Create `tests/fixtures/atom-feed.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Blog</title>
  <link href="https://atom.example.com"/>
  <entry>
    <title>Atom Entry</title>
    <link href="https://atom.example.com/entries/1"/>
    <id>urn:uuid:1234-5678</id>
    <published>2024-03-15T14:30:00Z</published>
    <updated>2024-03-15T15:00:00Z</updated>
    <author><name>Charlie</name></author>
    <content type="html"><![CDATA[<p>Atom content</p>]]></content>
    <category term="Atom"/>
  </entry>
</feed>
```

**Step 2: Write parser tests**

Create `tests/plugins/rss/parser.test.js`:

```js
// tests/plugins/rss/parser.test.js
import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFeed } from "../../../plugins/rss/parser.js";

const fixturesDir = join(import.meta.dirname, "../../fixtures");

describe("parseFeed", () => {
  test("parses RSS feed into AS2 articles", () => {
    const xml = readFileSync(join(fixturesDir, "rss-feed.xml"), "utf-8");
    const articles = parseFeed(xml, "Test Blog");

    assert.strictEqual(articles.length, 2);

    const first = articles[0];
    assert.strictEqual(first["@context"], "https://www.w3.org/ns/activitystreams");
    assert.strictEqual(first.type, "Article");
    assert.strictEqual(first.name, "First Post");
    assert.strictEqual(first.id, "https://example.com/posts/first");
    assert.strictEqual(first.url, "https://example.com/posts/first");
    assert.strictEqual(first.content, "<p>Full content here</p>");
    assert.strictEqual(first.published, "2024-03-15T14:30:00.000Z");
    assert.strictEqual(first.attributedTo.name, "Alice");
    assert.deepStrictEqual(first.tag, [
      { type: "Object", name: "Tech" },
      { type: "Object", name: "Node.js" },
    ]);
    assert.strictEqual(first.attachment.length, 1);
    assert.strictEqual(first.attachment[0].type, "Audio");
    assert.strictEqual(first.attachment[0].mediaType, "audio/mpeg");
    assert.strictEqual(first.attachment[0].url, "https://example.com/audio.mp3");

    const second = articles[1];
    assert.strictEqual(second.name, "Second Post");
    assert.strictEqual(second.content, "Another post");
    assert.strictEqual(second.attributedTo.name, "Bob");
    assert.deepStrictEqual(second.attachment, []);
  });

  test("parses Atom feed into AS2 articles", () => {
    const xml = readFileSync(join(fixturesDir, "atom-feed.xml"), "utf-8");
    const articles = parseFeed(xml, "Atom Blog");

    assert.strictEqual(articles.length, 1);

    const entry = articles[0];
    assert.strictEqual(entry.type, "Article");
    assert.strictEqual(entry.name, "Atom Entry");
    assert.strictEqual(entry.id, "https://atom.example.com/entries/1");
    assert.strictEqual(entry.content, "<p>Atom content</p>");
    assert.strictEqual(entry.published, "2024-03-15T14:30:00.000Z");
    assert.strictEqual(entry.attributedTo.name, "Charlie");
    assert.deepStrictEqual(entry.tag, [{ type: "Object", name: "Atom" }]);
    assert.strictEqual(entry.generator.name, "Atom Blog");
  });

  test("falls back to description when content:encoded is missing", () => {
    const xml = readFileSync(join(fixturesDir, "rss-feed.xml"), "utf-8");
    const articles = parseFeed(xml, "Test");
    // Second item has no content:encoded, should use description
    assert.strictEqual(articles[1].content, "Another post");
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `node --test tests/plugins/rss/parser.test.js`
Expected: Fails (parser.js doesn't exist)

**Step 4: Create plugin package.json**

Create `plugins/rss/package.json`:
```json
{
  "private": true,
  "dependencies": {
    "fast-xml-parser": "^5.2.0"
  }
}
```

Run: `npm install --prefix plugins/rss`

**Step 5: Implement RSS parser**

Create `plugins/rss/parser.js`:

```js
// plugins/rss/parser.js
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => ["item", "entry", "category", "enclosure", "link"].includes(name),
});

function enclosureToAttachment(enc) {
  const url = enc["@_url"];
  const mediaType = enc["@_type"] || "application/octet-stream";
  let type = "Link";
  if (mediaType.startsWith("audio/")) type = "Audio";
  else if (mediaType.startsWith("video/")) type = "Video";
  else if (mediaType.startsWith("image/")) type = "Image";
  return { type, mediaType, url };
}

function parseRSSItem(item, feedName) {
  const title = item.title || "";
  const link = typeof item.link === "string" ? item.link : item.link?.[0] || "";
  const content = item["content:encoded"] || item.description || "";
  const pubDate = item.pubDate ? new Date(item.pubDate).toISOString() : null;
  const author = item["dc:creator"] || item.author || feedName;

  const categories = (item.category || []).map((c) => {
    const name = typeof c === "string" ? c : c["#text"] || c;
    return { type: "Object", name };
  });

  const enclosures = (item.enclosure || []).map(enclosureToAttachment);

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Article",
    id: link,
    url: link,
    name: title,
    content,
    published: pubDate,
    attributedTo: { type: "Person", name: author },
    tag: categories,
    attachment: enclosures,
    generator: { type: "Application", name: feedName },
  };
}

function parseAtomEntry(entry, feedName) {
  const title = entry.title || "";
  const links = entry.link || [];
  const link = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate");
  const href = link?.["@_href"] || links[0]?.["@_href"] || "";
  const content = typeof entry.content === "object" ? entry.content["#text"] || "" : entry.content || "";
  const published = entry.published || entry.updated || null;
  const pubISO = published ? new Date(published).toISOString() : null;
  const author = entry.author?.name || feedName;

  const categories = (entry.category || []).map((c) => ({
    type: "Object",
    name: c["@_term"] || c["@_label"] || "",
  }));

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Article",
    id: href,
    url: href,
    name: title,
    content,
    published: pubISO,
    attributedTo: { type: "Person", name: author },
    tag: categories,
    attachment: [],
    generator: { type: "Application", name: feedName },
  };
}

export function parseFeed(xml, feedName) {
  const parsed = parser.parse(xml);

  // RSS format
  if (parsed.rss?.channel) {
    const channel = parsed.rss.channel;
    const items = channel.item || [];
    return items.map((item) => parseRSSItem(item, feedName));
  }

  // Atom format
  if (parsed.feed) {
    const entries = parsed.feed.entry || [];
    return entries.map((entry) => parseAtomEntry(entry, feedName));
  }

  return [];
}
```

**Step 6: Run parser tests**

Run: `node --test tests/plugins/rss/parser.test.js`
Expected: All 3 tests pass

**Step 7: Create RSS plugin index.js**

Create `plugins/rss/index.js`:

```js
// plugins/rss/index.js
import { mkdirSync, createWriteStream } from "node:fs";
import { join, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { parseFeed } from "./parser.js";

async function downloadEnclosure(url, tmpDir, index, log) {
  const ext = extname(new URL(url).pathname) || ".bin";
  const filename = `${index + 1}${ext}`;
  const filePath = join(tmpDir, filename);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      log(`Failed to download enclosure ${url}: ${response.status}`);
      return null;
    }
    const fileStream = createWriteStream(filePath);
    await pipeline(response.body, fileStream);
    log(`Downloaded: ${filename}`);
    return { relativePath: filename, tmpPath: filePath };
  } catch (err) {
    log(`Failed to download enclosure ${url}: ${err.message}`);
    return null;
  }
}

export default {
  name: "rss",
  description: "RSS/Atom feed archiver",

  async init(config) {
    const feeds = config.feeds || [];
    if (feeds.length === 0) {
      console.log("No feeds configured. Add feeds to config.json under plugins.rss.feeds");
      return;
    }

    console.log(`Configured ${feeds.length} feed(s):`);
    for (const feed of feeds) {
      console.log(`  ${feed.name || feed.url}`);
      try {
        const response = await fetch(feed.url, { method: "HEAD" });
        console.log(`    ${response.ok ? "OK" : `HTTP ${response.status}`}`);
      } catch (err) {
        console.log(`    Error: ${err.message}`);
      }
    }
  },

  async status(config) {
    const feeds = config.feeds || [];
    if (feeds.length === 0) {
      return { ok: false, message: "No feeds configured" };
    }
    return { ok: true, message: `${feeds.length} feed(s) configured` };
  },

  async run(config, context) {
    const feeds = config.feeds || [];
    const allPosts = [];
    const state = { ...context.state };

    for (const feed of feeds) {
      const feedName = feed.name || feed.url;
      context.log(`Fetching ${feedName}...`);

      try {
        const response = await fetch(feed.url);
        if (!response.ok) {
          context.log(`Failed to fetch ${feedName}: HTTP ${response.status}`);
          continue;
        }

        const xml = await response.text();
        const articles = parseFeed(xml, feedName);
        context.log(`Found ${articles.length} article(s)`);

        const lastSeen = state[feed.url] || null;
        const newArticles = articles.filter((a) => {
          if (!lastSeen || !a.published) return true;
          return new Date(a.published) > new Date(lastSeen);
        });

        if (newArticles.length === 0) {
          context.log("No new articles.");
          continue;
        }

        context.log(`${newArticles.length} new article(s)`);

        for (const as2 of newArticles) {
          // Download enclosures
          const mediaFiles = [];
          for (let i = 0; i < as2.attachment.length; i++) {
            const att = as2.attachment[i];
            const slug = as2.id ? new URL(as2.id).pathname.split("/").filter(Boolean).pop() : `${i}`;
            const downloadDir = join(context.tmpDir, slug);
            mkdirSync(downloadDir, { recursive: true });

            const result = await downloadEnclosure(att.url, downloadDir, i, context.log);
            if (result) {
              mediaFiles.push(result);
              // Update attachment URL to local path
              att.url = result.relativePath;
            }
          }

          allPosts.push({ as2, raw: { feed_url: feed.url, feed_name: feedName }, media: mediaFiles });
        }

        // Update state with newest article timestamp
        const newest = newArticles
          .filter((a) => a.published)
          .sort((a, b) => new Date(b.published) - new Date(a.published))[0];
        if (newest) {
          state[feed.url] = newest.published;
        }
      } catch (err) {
        context.log(`Error fetching ${feedName}: ${err.message}`);
      }
    }

    return { posts: allPosts, state };
  },
};
```

**Step 8: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 9: Commit**

```bash
git add plugins/rss/ tests/plugins/rss/ tests/fixtures/
git commit -m "feat: add RSS/Atom feed plugin with enclosure downloads"
```

---

### Task 8: Meta Archive Plugin

Create the Meta archive import plugin supporting Facebook and Instagram exports in JSON and HTML formats from both ZIP files and extracted folders.

**Files:**
- Create: `plugins/meta-archive/package.json`
- Create: `plugins/meta-archive/index.js`
- Create: `plugins/meta-archive/parser.js` (JSON + HTML parsers, UTF-8 fix)
- Create: `tests/plugins/meta-archive/parser.test.js`
- Create: `tests/fixtures/meta-instagram.json`
- Create: `tests/fixtures/meta-facebook.json`
- Create: `tests/fixtures/meta-instagram.html`

**Step 1: Create test fixtures**

Create `tests/fixtures/meta-instagram.json`:
```json
[
  {
    "media": [
      {
        "uri": "media/posts/202512/18035531567732190.jpg",
        "creation_timestamp": 1766716576
      },
      {
        "uri": "media/posts/202512/18333088726240760.jpg",
        "creation_timestamp": 1766716576
      }
    ],
    "title": "F\u00c3\u00aated.\nAll the scamps.",
    "creation_timestamp": 1766716577
  },
  {
    "media": [
      {
        "uri": "media/posts/202511/17878691337431447.jpg",
        "creation_timestamp": 1766000000
      }
    ],
    "title": "",
    "creation_timestamp": 1766000000
  }
]
```

Create `tests/fixtures/meta-facebook.json`:
```json
[
  {
    "timestamp": 1766716583,
    "attachments": [
      {
        "data": [
          {
            "media": {
              "uri": "your_facebook_activity/posts/media/Photos_123/photo1.jpg",
              "creation_timestamp": 1766716583
            }
          },
          {
            "media": {
              "uri": "your_facebook_activity/posts/media/Photos_123/photo2.jpg",
              "creation_timestamp": 1766716583
            }
          }
        ]
      }
    ],
    "data": [
      {
        "post": "One last post from my road trip.\nSome stats: great."
      },
      {
        "update_timestamp": 1766716583
      }
    ],
    "title": "Dylan Richard shared a photo."
  },
  {
    "timestamp": 1311650602,
    "attachments": [],
    "data": [
      {
        "post": "HOT DOG!"
      }
    ],
    "title": "Dylan Richard shared a photo."
  }
]
```

Create `tests/fixtures/meta-instagram.html`:
```html
<html><head><title>Posts</title></head><body>
<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">First caption here</h2><div class="_3-95 _a6-p"><div><a target="_blank" href="media/posts/202601/18064541627217797.jpg"><img src="media/posts/202601/18064541627217797.jpg" class="_a6_o _3-96" /></a></div></div><div class="_3-94 _a6-o">Jan 02, 2026 4:17 pm</div></div>
<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder"><h2 class="_3-95 _2pim _a6-h _a6-i">Second caption</h2><div class="_3-95 _a6-p"><div><a target="_blank" href="media/posts/202512/17878691337431447.jpg"><img src="media/posts/202512/17878691337431447.jpg" class="_a6_o _3-96" /></a></div><div><a target="_blank" href="media/posts/202512/18119831092556369.jpg"><img src="media/posts/202512/18119831092556369.jpg" class="_a6_o _3-96" /></a></div></div><div class="_3-94 _a6-o">Dec 01, 2025 4:09 pm</div></div>
</body></html>
```

**Step 2: Write parser tests**

Create `tests/plugins/meta-archive/parser.test.js`:

```js
// tests/plugins/meta-archive/parser.test.js
import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseInstagramJSON, parseFacebookJSON, parseInstagramHTML, fixMetaEncoding } from "../../../plugins/meta-archive/parser.js";

const fixturesDir = join(import.meta.dirname, "../../fixtures");

describe("fixMetaEncoding", () => {
  test("fixes double-encoded UTF-8", () => {
    // "Fêted" double-encoded: ê = C3 AA in UTF-8, stored as \u00c3\u00aa
    assert.strictEqual(fixMetaEncoding("F\u00c3\u00aated"), "Fêted");
  });

  test("fixes Schrodinger umlaut", () => {
    assert.strictEqual(fixMetaEncoding("Schr\u00c3\u00b6dinger"), "Schrödinger");
  });

  test("passes through normal ASCII text", () => {
    assert.strictEqual(fixMetaEncoding("Hello world"), "Hello world");
  });

  test("handles empty string", () => {
    assert.strictEqual(fixMetaEncoding(""), "");
  });
});

describe("parseInstagramJSON", () => {
  test("parses Instagram export JSON into AS2 objects", () => {
    const json = JSON.parse(readFileSync(join(fixturesDir, "meta-instagram.json"), "utf-8"));
    const posts = parseInstagramJSON(json, "detour1999");

    assert.strictEqual(posts.length, 2);

    const first = posts[0];
    assert.strictEqual(first.as2["@context"], "https://www.w3.org/ns/activitystreams");
    assert.strictEqual(first.as2.type, "Note");
    assert.ok(first.as2.published);
    assert.strictEqual(first.as2.attributedTo.name, "detour1999");
    assert.strictEqual(first.as2.generator.name, "Instagram");
    // Caption should have fixed encoding
    assert.ok(first.as2.content.includes("Fêted"));
    assert.strictEqual(first.as2.attachment.length, 2);

    // Second post has empty caption
    assert.strictEqual(posts[1].as2.content, "");
  });

  test("includes media URIs in raw data", () => {
    const json = JSON.parse(readFileSync(join(fixturesDir, "meta-instagram.json"), "utf-8"));
    const posts = parseInstagramJSON(json, "testuser");

    assert.strictEqual(posts[0].mediaUris.length, 2);
    assert.ok(posts[0].mediaUris[0].includes("18035531567732190.jpg"));
  });
});

describe("parseFacebookJSON", () => {
  test("parses Facebook export JSON into AS2 objects", () => {
    const json = JSON.parse(readFileSync(join(fixturesDir, "meta-facebook.json"), "utf-8"));
    const posts = parseFacebookJSON(json, "dylanr");

    assert.strictEqual(posts.length, 2);

    const first = posts[0];
    assert.strictEqual(first.as2.type, "Note");
    assert.ok(first.as2.published);
    assert.strictEqual(first.as2.attributedTo.name, "dylanr");
    assert.ok(first.as2.content.includes("road trip"));
    assert.strictEqual(first.as2.attachment.length, 2);
    assert.strictEqual(first.as2.generator.name, "Facebook");

    // Second post has no media
    assert.strictEqual(posts[1].as2.content, "HOT DOG!");
    assert.strictEqual(posts[1].as2.attachment.length, 0);
  });
});

describe("parseInstagramHTML", () => {
  test("parses Instagram HTML export into AS2 objects", () => {
    const html = readFileSync(join(fixturesDir, "meta-instagram.html"), "utf-8");
    const posts = parseInstagramHTML(html, "detour-cars");

    assert.strictEqual(posts.length, 2);

    const first = posts[0];
    assert.strictEqual(first.as2.type, "Note");
    assert.strictEqual(first.as2.content, "First caption here");
    assert.ok(first.as2.published);
    assert.strictEqual(first.as2.attributedTo.name, "detour-cars");
    assert.strictEqual(first.as2.attachment.length, 1);

    const second = posts[1];
    assert.strictEqual(second.as2.content, "Second caption");
    assert.strictEqual(second.as2.attachment.length, 2);
    assert.strictEqual(second.mediaUris.length, 2);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `node --test tests/plugins/meta-archive/parser.test.js`
Expected: Fails (parser.js doesn't exist)

**Step 4: Create plugin package.json**

Create `plugins/meta-archive/package.json`:
```json
{
  "private": true,
  "dependencies": {
    "adm-zip": "^0.5.16"
  }
}
```

Run: `npm install --prefix plugins/meta-archive`

**Step 5: Implement the parser**

Create `plugins/meta-archive/parser.js`:

```js
// plugins/meta-archive/parser.js

export function fixMetaEncoding(text) {
  if (!text) return "";
  // Meta double-encodes UTF-8: each byte of the UTF-8 sequence is stored as a \u00xx escape.
  // We detect sequences of Latin-1 chars in the C0-FF range and decode them as UTF-8 bytes.
  try {
    // Convert string to bytes treating each char as a Latin-1 byte, then decode as UTF-8
    const bytes = new Uint8Array([...text].map((c) => c.charCodeAt(0)));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    // If decoding produced replacement chars, the original wasn't double-encoded
    if (decoded.includes("\uFFFD")) return text;
    return decoded;
  } catch {
    return text;
  }
}

function mediaTypeFromUri(uri) {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".mp4") || lower.endsWith(".mov")) return { type: "Video", mediaType: "video/mp4" };
  if (lower.endsWith(".webp")) return { type: "Image", mediaType: "image/webp" };
  if (lower.endsWith(".png")) return { type: "Image", mediaType: "image/png" };
  return { type: "Image", mediaType: "image/jpeg" };
}

export function parseInstagramJSON(posts, username) {
  return posts.map((post, index) => {
    const timestamp = post.creation_timestamp;
    const published = new Date(timestamp * 1000).toISOString();
    const caption = fixMetaEncoding(post.title || "");
    const mediaItems = post.media || [];
    const mediaUris = mediaItems.map((m) => m.uri);

    // Derive a post ID from the first media filename or index
    const firstMedia = mediaItems[0];
    const postId = firstMedia ? firstMedia.uri.split("/").pop().replace(/\.\w+$/, "") : `post-${index}`;

    const as2 = {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Note",
      id: `meta-archive:instagram:${postId}`,
      published,
      attributedTo: { type: "Person", name: username },
      content: caption,
      attachment: mediaItems.map((m) => ({
        ...mediaTypeFromUri(m.uri),
        url: m.uri.split("/").pop(),
      })),
      generator: { type: "Application", name: "Instagram" },
    };

    return { as2, raw: post, mediaUris };
  });
}

export function parseFacebookJSON(posts, username) {
  return posts.map((post, index) => {
    const timestamp = post.timestamp;
    const published = new Date(timestamp * 1000).toISOString();

    // Extract post text from data array
    const dataEntries = post.data || [];
    const textEntry = dataEntries.find((d) => d.post);
    const caption = fixMetaEncoding(textEntry?.post || "");

    // Extract media URIs from attachments
    const mediaUris = [];
    const attachmentItems = [];
    for (const attachment of post.attachments || []) {
      for (const item of attachment.data || []) {
        if (item.media?.uri) {
          mediaUris.push(item.media.uri);
          attachmentItems.push({
            ...mediaTypeFromUri(item.media.uri),
            url: item.media.uri.split("/").pop(),
          });
        }
      }
    }

    // Derive post ID from first media or index
    const postId = mediaUris.length > 0
      ? mediaUris[0].split("/").pop().replace(/\.\w+$/, "")
      : `post-${index}`;

    const as2 = {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Note",
      id: `meta-archive:facebook:${postId}`,
      published,
      attributedTo: { type: "Person", name: username },
      content: caption,
      attachment: attachmentItems,
      generator: { type: "Application", name: "Facebook" },
    };

    return { as2, raw: post, mediaUris };
  });
}

export function parseInstagramHTML(html, username) {
  const posts = [];

  // Each post is a div.pam block containing h2 (caption), images, and timestamp
  const postPattern = /<div class="pam[^"]*_a6-g[^"]*">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
  // Simpler: split on the post container pattern
  const blocks = html.split(/<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder">/).slice(1);

  for (const [index, block] of blocks.entries()) {
    // Extract caption from h2
    const captionMatch = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    const caption = captionMatch ? captionMatch[1].replace(/&#039;/g, "'").replace(/&#064;/g, "@").replace(/&amp;/g, "&").replace(/<[^>]+>/g, "").trim() : "";

    // Extract media hrefs
    const mediaUris = [];
    const hrefPattern = /href="(media\/posts\/[^"]+)"/g;
    let hrefMatch;
    while ((hrefMatch = hrefPattern.exec(block)) !== null) {
      mediaUris.push(hrefMatch[1]);
    }

    // Extract timestamp
    const tsMatch = block.match(/<div class="_3-94 _a6-o">([^<]+)<\/div>/);
    const tsText = tsMatch ? tsMatch[1].trim() : "";
    const published = tsText ? new Date(tsText).toISOString() : new Date().toISOString();

    const postId = mediaUris.length > 0
      ? mediaUris[0].split("/").pop().replace(/\.\w+$/, "")
      : `html-post-${index}`;

    const as2 = {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Note",
      id: `meta-archive:instagram:${postId}`,
      published,
      attributedTo: { type: "Person", name: username },
      content: fixMetaEncoding(caption),
      attachment: mediaUris.map((uri) => ({
        ...mediaTypeFromUri(uri),
        url: uri.split("/").pop(),
      })),
      generator: { type: "Application", name: "Instagram" },
    };

    posts.push({ as2, raw: { html_caption: caption, media_uris: mediaUris, timestamp: tsText }, mediaUris });
  }

  return posts;
}
```

**Step 6: Run parser tests**

Run: `node --test tests/plugins/meta-archive/parser.test.js`
Expected: All tests pass

**Step 7: Create Meta archive plugin index.js**

Create `plugins/meta-archive/index.js`:

```js
// plugins/meta-archive/index.js
import { existsSync, readFileSync, copyFileSync, mkdirSync, statSync } from "node:fs";
import { join, extname, basename, dirname } from "node:path";
import { homedir } from "node:os";
import { parseInstagramJSON, parseFacebookJSON, parseInstagramHTML } from "./parser.js";

function expandPath(p) {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

function detectFormat(sourcePath) {
  const isZip = extname(sourcePath).toLowerCase() === ".zip";
  return { isZip };
}

function findPostsFile(baseDir, platform) {
  if (platform === "instagram") {
    const jsonPath = join(baseDir, "your_instagram_activity", "media", "posts_1.json");
    if (existsSync(jsonPath)) return { path: jsonPath, format: "json" };
    const htmlPath = join(baseDir, "your_instagram_activity", "media", "posts_1.html");
    if (existsSync(htmlPath)) return { path: htmlPath, format: "html" };
  }
  if (platform === "facebook") {
    const postsDir = join(baseDir, "your_facebook_activity", "posts");
    if (existsSync(postsDir)) {
      // Find the main posts JSON file (name varies)
      const { readdirSync } = await import("node:fs");
      const files = readdirSync(postsDir).filter((f) => f.startsWith("your_posts") && f.endsWith(".json"));
      if (files.length > 0) return { path: join(postsDir, files[0]), format: "json" };
    }
  }
  return null;
}

export default {
  name: "meta-archive",
  description: "Import posts from Meta (Facebook/Instagram) data exports",

  async init(config) {
    const sources = config.sources || [];
    if (sources.length === 0) {
      console.log("No sources configured. Add sources to config.json under plugins.meta-archive.sources");
      return;
    }

    for (const source of sources) {
      const path = expandPath(source.path);
      const exists = existsSync(path);
      console.log(`  ${source.platform}: ${path} - ${exists ? "found" : "NOT FOUND"}`);
      if (exists) {
        const stat = statSync(path);
        console.log(`    Type: ${stat.isDirectory() ? "folder" : "file"} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      }
    }
  },

  async status(config) {
    const sources = config.sources || [];
    if (sources.length === 0) {
      return { ok: false, message: "No sources configured" };
    }
    const missing = sources.filter((s) => !existsSync(expandPath(s.path)));
    if (missing.length > 0) {
      return { ok: false, message: `Missing sources: ${missing.map((s) => s.path).join(", ")}` };
    }
    return { ok: true, message: `${sources.length} source(s) configured` };
  },

  async run(config, context) {
    const sources = config.sources || [];
    const allPosts = [];
    const state = { ...context.state };

    for (const source of sources) {
      const sourcePath = expandPath(source.path);
      const sourceKey = `${source.platform}:${source.path}`;

      if (state[sourceKey]) {
        context.log(`Skipping ${source.path} (already imported)`);
        continue;
      }

      if (!existsSync(sourcePath)) {
        context.log(`Source not found: ${sourcePath}`);
        continue;
      }

      context.log(`Importing ${source.platform} from ${source.path}...`);

      let baseDir;
      let cleanup = null;

      const { isZip } = detectFormat(sourcePath);

      if (isZip) {
        // Extract ZIP to temp directory
        const AdmZip = (await import("adm-zip")).default;
        const zip = new AdmZip(sourcePath);
        baseDir = join(context.tmpDir, basename(sourcePath, ".zip"));
        mkdirSync(baseDir, { recursive: true });
        zip.extractAllTo(baseDir, true);
        context.log("Extracted ZIP archive");
      } else {
        baseDir = sourcePath;
      }

      // Find and parse posts
      let parsedPosts = [];
      const username = config.username || source.username || "unknown";

      if (source.platform === "instagram") {
        const jsonPath = join(baseDir, "your_instagram_activity", "media", "posts_1.json");
        const htmlPath = join(baseDir, "your_instagram_activity", "media", "posts_1.html");

        if (existsSync(jsonPath)) {
          const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
          parsedPosts = parseInstagramJSON(data, username);
          context.log(`Parsed ${parsedPosts.length} post(s) from JSON`);
        } else if (existsSync(htmlPath)) {
          const html = readFileSync(htmlPath, "utf-8");
          parsedPosts = parseInstagramHTML(html, username);
          context.log(`Parsed ${parsedPosts.length} post(s) from HTML`);
        } else {
          context.log("Could not find posts file in export");
          continue;
        }
      } else if (source.platform === "facebook") {
        // Find the posts JSON (filename varies)
        const postsDir = join(baseDir, "your_facebook_activity", "posts");
        if (existsSync(postsDir)) {
          const { readdirSync } = await import("node:fs");
          const files = readdirSync(postsDir).filter((f) => f.startsWith("your_posts") && f.endsWith(".json"));
          if (files.length > 0) {
            const data = JSON.parse(readFileSync(join(postsDir, files[0]), "utf-8"));
            parsedPosts = parseFacebookJSON(data, username);
            context.log(`Parsed ${parsedPosts.length} post(s) from JSON`);
          } else {
            context.log("Could not find posts JSON in Facebook export");
            continue;
          }
        }
      }

      // Copy media files to tmpDir
      for (const post of parsedPosts) {
        const mediaFiles = [];

        for (const [i, uri] of post.mediaUris.entries()) {
          const mediaSourcePath = join(baseDir, uri);
          if (existsSync(mediaSourcePath)) {
            const filename = basename(uri);
            const postSlug = post.as2.id.split(":").pop();
            const downloadDir = join(context.tmpDir, postSlug);
            mkdirSync(downloadDir, { recursive: true });
            const destPath = join(downloadDir, filename);
            copyFileSync(mediaSourcePath, destPath);
            mediaFiles.push({ relativePath: filename, tmpPath: destPath });

            // Update attachment URL to local filename
            if (post.as2.attachment[i]) {
              post.as2.attachment[i].url = filename;
            }
          }
        }

        allPosts.push({ as2: post.as2, raw: post.raw, media: mediaFiles });
      }

      state[sourceKey] = new Date().toISOString();
    }

    return { posts: allPosts, state };
  },
};
```

**Step 8: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 9: Commit**

```bash
git add plugins/meta-archive/ tests/plugins/meta-archive/ tests/fixtures/meta-*
git commit -m "feat: add Meta archive plugin for Facebook/Instagram data exports"
```

---

### Task 9: Update README, BACKLOG, and Docs

Update documentation to reflect all changes.

**Files:**
- Modify: `README.md`
- Modify: `BACKLOG.md`
- Modify: `CONTRIBUTING.md` (update plugin interface references)

**Step 1: Update README**

Key changes:
- CLI examples: `postkeeper run` instead of `postkeeper poll`
- Add RSS plugin config section
- Add Meta archive plugin config section
- Update plugin interface: `run` instead of `poll`
- Update install instructions (note about plugin dependencies)

**Step 2: Update BACKLOG**

Mark all addressed items as done. Remove completed items or check them off. Keep "Distribution" and "Instagram integration tests manual" as remaining items.

**Step 3: Update CONTRIBUTING.md**

- Update plugin interface examples: `poll` → `run`
- Update `activity` object section to reflect plugins return AS2 directly
- Add note about plugin-level `package.json`

**Step 4: Commit**

```bash
git add README.md BACKLOG.md CONTRIBUTING.md
git commit -m "docs: update README, BACKLOG, and CONTRIBUTING for new architecture"
```

---

### Task 10: Verify Coverage and Final Checks

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 2: Run coverage**

Run: `npm run test:coverage`
Expected: Coverage >= 90% lines, 80% branches, 80% functions

**Step 3: Fix coverage if needed**

If coverage drops, add tests for uncovered lines or add c8 ignore comments for unreachable code (e.g., ZIP error handling in meta-archive that requires a corrupt ZIP to test).

**Step 4: Commit any coverage fixes**

---

### Task 11: Push and Create PR

**Step 1: Push branch**

```bash
git push -u origin backlog-and-plugins
```

**Step 2: Create PR**

```bash
gh pr create --title "Backlog cleanup and new plugins" --body "$(cat <<'EOF'
## Summary

- Renamed `poll` command to `run` for generic plugin support
- Fixed cwd-relative path resolution (config, plugins)
- Moved AS2 conversion from core to plugins; core now validates
- Added filename derivation from AS2 fields (not Instagram-specific)
- Fixed console.log usage in Instagram downloader
- Added plugin-level package.json support
- Added RSS/Atom feed plugin
- Added Meta archive import plugin (Facebook + Instagram, JSON + HTML)
- Added migration script tests

## Test plan

- [ ] `npm test` passes all tests
- [ ] `npm run test:coverage` meets thresholds
- [ ] `postkeeper list` shows all three plugins
- [ ] `postkeeper run` (from non-project-root dir) works

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 3: Verify CI passes**

Wait for GitHub Actions CI to pass.
