# Postkeeper Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the existing instapost CLI into postkeeper - a plugin-based social media archiver with ActivityStreams 2.0 output.

**Architecture:** Thin core (plugin loader, CLI, orchestrator, AS2 storage) with fat plugins (own their entire fetch/download workflow). Instagram is the first plugin, built from existing instapost code. Posts output as `.as2.json` (ActivityStreams 2.0) + `.raw.json` (platform-specific), with media files alongside.

**Tech Stack:** Node.js (ES modules), Commander.js (CLI), Playwright (Instagram plugin), node:test (testing)

---

### Task 1: Plugin Loader

Build the module that discovers and loads plugins from the `plugins/` directory.

**Files:**
- Create: `src/core/plugins.js`
- Create: `tests/core/plugins.test.js`

**Step 1: Write the failing test**

```js
// tests/core/plugins.test.js
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { discoverPlugins } from "../../src/core/plugins.js";

describe("discoverPlugins", () => {
  const tmpDir = join(import.meta.dirname, ".tmp-plugins-test");
  const pluginsDir = join(tmpDir, "plugins");

  beforeEach(() => mkdirSync(pluginsDir, { recursive: true }));
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("discovers plugins with index.js and required exports", async () => {
    const pluginDir = join(pluginsDir, "test-plugin");
    mkdirSync(pluginDir);
    writeFileSync(
      join(pluginDir, "index.js"),
      `export default {
        name: "test-plugin",
        description: "A test plugin",
        async init(config) {},
        async poll(config, context) { return { posts: [], state: {} }; },
      };`
    );

    const plugins = await discoverPlugins(pluginsDir);
    assert.strictEqual(plugins.length, 1);
    assert.strictEqual(plugins[0].name, "test-plugin");
    assert.strictEqual(typeof plugins[0].poll, "function");
    assert.strictEqual(typeof plugins[0].init, "function");
  });

  test("skips directories without index.js", async () => {
    mkdirSync(join(pluginsDir, "empty-dir"));
    const plugins = await discoverPlugins(pluginsDir);
    assert.strictEqual(plugins.length, 0);
  });

  test("skips plugins missing required exports", async () => {
    const pluginDir = join(pluginsDir, "bad-plugin");
    mkdirSync(pluginDir);
    writeFileSync(
      join(pluginDir, "index.js"),
      `export default { name: "bad" };`
    );

    const plugins = await discoverPlugins(pluginsDir);
    assert.strictEqual(plugins.length, 0);
  });

  test("returns empty array when plugins dir does not exist", async () => {
    const plugins = await discoverPlugins(join(tmpDir, "nonexistent"));
    assert.deepStrictEqual(plugins, []);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/core/plugins.test.js`
Expected: FAIL — module doesn't exist.

**Step 3: Write minimal implementation**

```js
// src/core/plugins.js
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export async function discoverPlugins(pluginsDir) {
  if (!existsSync(pluginsDir)) return [];

  const entries = readdirSync(pluginsDir, { withFileTypes: true });
  const plugins = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const indexPath = join(pluginsDir, entry.name, "index.js");
    if (!existsSync(indexPath)) continue;

    try {
      const mod = await import(pathToFileURL(indexPath).href);
      const plugin = mod.default;

      if (!plugin?.name || typeof plugin.poll !== "function" || typeof plugin.init !== "function") {
        console.warn(`Skipping plugin "${entry.name}": missing required exports (name, init, poll)`);
        continue;
      }

      plugins.push(plugin);
    } catch (err) {
      console.warn(`Skipping plugin "${entry.name}": ${err.message}`);
    }
  }

  return plugins;
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/core/plugins.test.js`
Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/core/plugins.js tests/core/plugins.test.js
git commit -m "feat: plugin discovery and loading"
```

---

### Task 2: Config Loader (Refactor for Postkeeper)

Replace the Instagram-specific config loader with one that supports the new config format (global settings + per-plugin config sections).

**Files:**
- Modify: `src/config.js`
- Modify: `tests/config.test.js`
- Modify: `config.json`

**Step 1: Rewrite the test**

```js
// tests/config.test.js
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const tmpDir = join(import.meta.dirname, ".tmp-config-test");

  beforeEach(() => mkdirSync(tmpDir, { recursive: true }));
  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

  test("loads config with archive_dir and plugins section", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        archive_dir: "./my-archive",
        plugins: {
          instagram: { profiles: ["user1"], profile_dir: "./.bp" },
        },
      })
    );
    const config = loadConfig(configPath);
    assert.strictEqual(config.archive_dir, "./my-archive");
    assert.deepStrictEqual(config.plugins.instagram.profiles, ["user1"]);
  });

  test("applies default archive_dir", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ plugins: {} }));
    const config = loadConfig(configPath);
    assert.strictEqual(config.archive_dir, "./archive");
  });

  test("throws if config file is missing", () => {
    assert.throws(() => loadConfig(join(tmpDir, "nope.json")), /ENOENT|not found/i);
  });

  test("defaults plugins to empty object if missing", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({}));
    const config = loadConfig(configPath);
    assert.deepStrictEqual(config.plugins, {});
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/config.test.js`
Expected: FAIL — old tests use old config shape.

**Step 3: Rewrite implementation**

```js
// src/config.js
import { readFileSync } from "node:fs";

export function loadConfig(configPath) {
  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw);

  return {
    archive_dir: config.archive_dir || "./archive",
    plugins: config.plugins || {},
  };
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/config.test.js`
Expected: All 4 tests PASS.

**Step 5: Update config.json to new format**

```json
{
  "archive_dir": "./archive",
  "plugins": {
    "instagram": {
      "profiles": [],
      "profile_dir": "./.browser-profile"
    }
  }
}
```

**Step 6: Commit**

```bash
git add src/config.js tests/config.test.js config.json
git commit -m "refactor: config loader for postkeeper plugin format"
```

---

### Task 3: AS2 Converter

Build the module that converts an Instagram-format post (as returned by the existing `parsePost`) into an ActivityStreams 2.0 object. This is a pure function, highly testable.

**Files:**
- Create: `src/core/as2.js`
- Create: `tests/core/as2.test.js`

**Step 1: Write the failing test**

```js
// tests/core/as2.test.js
import { test, describe } from "node:test";
import assert from "node:assert";
import { toAS2 } from "../../src/core/as2.js";

describe("toAS2", () => {
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

    const as2 = toAS2(post, "instagram");

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
    assert.strictEqual(as2.attachment[0].mediaType, "image/jpeg");
    assert.strictEqual(as2.location.type, "Place");
    assert.strictEqual(as2.location.name, "Portland");
    assert.strictEqual(as2.tag.length, 1);
    assert.strictEqual(as2.tag[0].type, "Mention");
    assert.strictEqual(as2.tag[0].name, "@friend1");
    assert.strictEqual(as2.likes.totalItems, 42);
    assert.strictEqual(as2.replies.totalItems, 3);
    assert.strictEqual(as2.generator.name, "Instagram");
  });

  test("converts a carousel post with multiple attachments", () => {
    const post = {
      shortcode: "XYZ789",
      url: "https://www.instagram.com/p/XYZ789/",
      id: "67890",
      username: "testuser",
      timestamp: "2024-03-15T14:30:00.000Z",
      caption: "Carousel!",
      location: null,
      tagged_users: [],
      alt_text: null,
      likes: 5,
      comments: 1,
      media_type: "carousel",
      media: [
        { type: "image", url: "https://cdn.example.com/1.jpg", file: "1.jpg" },
        { type: "image", url: "https://cdn.example.com/2.jpg", file: "2.jpg" },
        { type: "video", url: "https://cdn.example.com/3.mp4", file: "3.mp4" },
      ],
    };

    const as2 = toAS2(post, "instagram");

    assert.strictEqual(as2.attachment.length, 3);
    assert.strictEqual(as2.attachment[0].type, "Image");
    assert.strictEqual(as2.attachment[0].url, "1.jpg");
    assert.strictEqual(as2.attachment[2].type, "Video");
    assert.strictEqual(as2.attachment[2].url, "3.mp4");
    assert.strictEqual(as2.attachment[2].mediaType, "video/mp4");
    assert.strictEqual(as2.location, undefined);
    assert.deepStrictEqual(as2.tag, []);
  });

  test("converts a video post", () => {
    const post = {
      shortcode: "VID111",
      url: "https://www.instagram.com/p/VID111/",
      id: "11111",
      username: "testuser",
      timestamp: "2024-03-15T14:30:00.000Z",
      caption: "",
      location: null,
      tagged_users: [],
      alt_text: null,
      likes: 0,
      comments: 0,
      media_type: "video",
      media: [{ type: "video", url: "https://cdn.example.com/video.mp4", file: "1.mp4" }],
    };

    const as2 = toAS2(post, "instagram");

    assert.strictEqual(as2.attachment.length, 1);
    assert.strictEqual(as2.attachment[0].type, "Video");
    assert.strictEqual(as2.attachment[0].mediaType, "video/mp4");
  });

  test("uses generic attributedTo when platform is unknown", () => {
    const post = {
      shortcode: "ABC",
      url: "https://example.com/post/ABC",
      id: "1",
      username: "someone",
      timestamp: "2024-01-01T00:00:00.000Z",
      caption: "test",
      location: null,
      tagged_users: [],
      alt_text: null,
      likes: 0,
      comments: 0,
      media_type: "image",
      media: [{ type: "image", url: "https://example.com/img.jpg", file: "1.jpg" }],
    };

    const as2 = toAS2(post, "somefeed");

    assert.strictEqual(as2.attributedTo.name, "someone");
    // No platform-specific URL template, just the name
    assert.strictEqual(as2.attributedTo.url, undefined);
    assert.strictEqual(as2.generator.name, "somefeed");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/core/as2.test.js`
Expected: FAIL — module doesn't exist.

**Step 3: Write implementation**

```js
// src/core/as2.js

const PLATFORM_USER_URL = {
  instagram: (username) => `https://www.instagram.com/${username}/`,
};

function mediaTypeToAS2(type) {
  if (type === "video") return { type: "Video", mediaType: "video/mp4" };
  return { type: "Image", mediaType: "image/jpeg" };
}

export function toAS2(post, pluginName) {
  const userUrlFn = PLATFORM_USER_URL[pluginName];

  const as2 = {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Note",
    id: post.url,
    url: post.url,
    published: post.timestamp,
    attributedTo: {
      type: "Person",
      name: post.username,
      ...(userUrlFn ? { url: userUrlFn(post.username) } : {}),
    },
    content: post.caption,
    attachment: post.media.map((m, i) => {
      const base = mediaTypeToAS2(m.type);
      const obj = { ...base, url: m.file };
      // Alt text on first attachment if available
      if (i === 0 && post.alt_text) {
        obj.name = post.alt_text;
      }
      return obj;
    }),
    tag: (post.tagged_users || []).map((u) => ({
      type: "Mention",
      href: userUrlFn ? userUrlFn(u) : undefined,
      name: `@${u}`,
    })),
    likes: { type: "Collection", totalItems: post.likes || 0 },
    replies: { type: "Collection", totalItems: post.comments || 0 },
    generator: {
      type: "Application",
      name: pluginName.charAt(0).toUpperCase() + pluginName.slice(1),
    },
  };

  if (post.location) {
    as2.location = { type: "Place", name: post.location.name };
  }

  // Clean up empty/undefined fields
  if (as2.tag.length === 0) as2.tag = [];

  return as2;
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/core/as2.test.js`
Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add src/core/as2.js tests/core/as2.test.js
git commit -m "feat: ActivityStreams 2.0 converter"
```

---

### Task 4: Core Orchestrator

Build the orchestrator that loads config, discovers plugins, manages state, calls plugins, and writes output files (AS2 + raw JSON + moves media).

**Files:**
- Create: `src/core/orchestrator.js`
- Create: `tests/core/orchestrator.test.js`

**Step 1: Write the failing test**

```js
// tests/core/orchestrator.test.js
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
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
    // Pre-seed state
    const stateDir = join(archiveDir, "testplatform");
    mkdirSync(stateDir, { recursive: true });
    const statePath = join(stateDir, "state.json");
    const existingState = { lastSeen: "2024-01-01T00:00:00.000Z" };
    const { writeFileSync } = await import("node:fs");
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
    // Create a fake media file in a tmp location
    const fakeTmpDir = join(tmpDir, "tmp-media");
    mkdirSync(fakeTmpDir, { recursive: true });
    const { writeFileSync } = await import("node:fs");
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
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/core/orchestrator.test.js`
Expected: FAIL — module doesn't exist.

**Step 3: Write implementation**

```js
// src/core/orchestrator.js
import { mkdirSync, writeFileSync, copyFileSync, existsSync, readFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { toAS2 } from "./as2.js";

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

export async function runPoll(plugin, pluginConfig, archiveDir) {
  const state = loadPluginState(archiveDir, plugin.name);
  const tmpDir = mkdtempSync(join(tmpdir(), `postkeeper-${plugin.name}-`));

  const context = {
    state,
    tmpDir,
    log: (msg) => console.log(`  [${plugin.name}] ${msg}`),
  };

  const result = await plugin.poll(pluginConfig, context);

  for (const post of result.posts) {
    const { activity, raw, media } = post;
    const datePrefix = activity.timestamp.slice(0, 10);
    const baseName = `${datePrefix}-${activity.shortcode}`;
    const userDir = join(archiveDir, plugin.name, "posts", activity.username);

    // Write AS2 JSON
    const as2 = toAS2(activity, plugin.name);
    const as2Path = join(userDir, `${baseName}.as2.json`);
    mkdirSync(dirname(as2Path), { recursive: true });
    writeFileSync(as2Path, JSON.stringify(as2, null, 2));

    // Write raw JSON
    const rawPath = join(userDir, `${baseName}.raw.json`);
    writeFileSync(rawPath, JSON.stringify(raw, null, 2));

    // Move media files
    if (media && media.length > 0) {
      const mediaDir = join(userDir, baseName);
      mkdirSync(mediaDir, { recursive: true });
      for (const m of media) {
        if (m.tmpPath && existsSync(m.tmpPath)) {
          copyFileSync(m.tmpPath, join(mediaDir, m.relativePath));
        }
      }
    }
  }

  // Save updated state
  savePluginState(archiveDir, plugin.name, result.state);
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/core/orchestrator.test.js`
Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add src/core/orchestrator.js tests/core/orchestrator.test.js
git commit -m "feat: core orchestrator with AS2 output and state management"
```

---

### Task 5: CLI Rewrite

Replace the instapost CLI with the postkeeper CLI that routes to plugins.

**Files:**
- Modify: `src/cli.js`
- Modify: `package.json` (rename bin entry)

**Step 1: Rewrite the CLI**

```js
#!/usr/bin/env node
// src/cli.js
import { Command } from "commander";
import { resolve, join } from "node:path";
import { loadConfig } from "./config.js";
import { discoverPlugins } from "./core/plugins.js";
import { runPoll } from "./core/orchestrator.js";

const program = new Command();

program
  .name("postkeeper")
  .description("Local social media archiver with plugin support")
  .version("0.1.0");

program
  .command("list")
  .description("List installed plugins")
  .action(async () => {
    const plugins = await discoverPlugins(resolve("plugins"));
    if (plugins.length === 0) {
      console.log("No plugins found in plugins/");
      return;
    }
    for (const p of plugins) {
      console.log(`  ${p.name} - ${p.description || "(no description)"}`);
    }
  });

program
  .command("init <plugin>")
  .description("Run first-time setup for a plugin")
  .action(async (pluginName) => {
    const config = loadConfig("config.json");
    const plugins = await discoverPlugins(resolve("plugins"));
    const plugin = plugins.find((p) => p.name === pluginName);
    if (!plugin) {
      console.error(`Plugin "${pluginName}" not found. Run "postkeeper list" to see available plugins.`);
      process.exit(1);
    }
    await plugin.init(config.plugins[pluginName] || {});
  });

program
  .command("status [plugin]")
  .description("Check plugin connectivity/auth status")
  .action(async (pluginName) => {
    const config = loadConfig("config.json");
    const plugins = await discoverPlugins(resolve("plugins"));
    const targets = pluginName ? plugins.filter((p) => p.name === pluginName) : plugins;

    if (targets.length === 0) {
      console.error(pluginName ? `Plugin "${pluginName}" not found.` : "No plugins found.");
      process.exit(1);
    }

    for (const plugin of targets) {
      if (typeof plugin.status !== "function") {
        console.log(`  ${plugin.name}: OK (no status check)`);
        continue;
      }
      try {
        const result = await plugin.status(config.plugins[plugin.name] || {});
        console.log(`  ${plugin.name}: ${result.ok ? "OK" : "ERROR"} - ${result.message}`);
      } catch (err) {
        console.log(`  ${plugin.name}: ERROR - ${err.message}`);
      }
    }
  });

program
  .command("poll [plugin]")
  .description("Poll for new posts")
  .action(async (pluginName) => {
    const config = loadConfig("config.json");
    const archiveDir = resolve(config.archive_dir);
    const plugins = await discoverPlugins(resolve("plugins"));
    const targets = pluginName ? plugins.filter((p) => p.name === pluginName) : plugins;

    if (targets.length === 0) {
      console.error(pluginName ? `Plugin "${pluginName}" not found.` : "No plugins found.");
      process.exit(1);
    }

    for (const plugin of targets) {
      console.log(`\nPolling ${plugin.name}...`);

      // Pre-flight status check
      if (typeof plugin.status === "function") {
        try {
          const status = await plugin.status(config.plugins[plugin.name] || {});
          if (!status.ok) {
            console.error(`  Skipping ${plugin.name}: ${status.message}`);
            continue;
          }
        } catch (err) {
          console.error(`  Skipping ${plugin.name}: status check failed - ${err.message}`);
          continue;
        }
      }

      try {
        await runPoll(plugin, config.plugins[plugin.name] || {}, archiveDir);
        console.log(`  ${plugin.name} done.`);
      } catch (err) {
        console.error(`  Error polling ${plugin.name}: ${err.message}`);
      }

      // Shutdown if supported
      if (typeof plugin.shutdown === "function") {
        await plugin.shutdown();
      }
    }

    console.log("\nDone.");
  });

program.parse();
```

**Step 2: Update package.json bin entry**

Change `"instapost"` to `"postkeeper"` in the `bin` field, and update name/description:

```json
{
  "name": "postkeeper",
  "description": "Local social media archiver with plugin support",
  "bin": {
    "postkeeper": "./src/cli.js"
  }
}
```

**Step 3: Verify the CLI loads**

Run: `node src/cli.js --help`
Expected: Shows "postkeeper" with `list`, `init`, `status`, `poll` commands.

Run: `node src/cli.js list`
Expected: "No plugins found in plugins/" (no plugins installed yet).

**Step 4: Commit**

```bash
git add src/cli.js package.json
git commit -m "refactor: postkeeper CLI with plugin routing"
```

---

### Task 6: Instagram Plugin

Move existing Instagram code into a plugin that implements the postkeeper plugin interface. The plugin handles init (browser login), status (session check), poll (fetch + download + return AS2-ready posts), and shutdown (close browser).

**Files:**
- Create: `plugins/instagram/index.js`
- Move/adapt: `src/extractor.js` → `plugins/instagram/extractor.js`
- Move/adapt: `src/downloader.js` → `plugins/instagram/downloader.js` (media download only)
- Move/adapt: `src/commands/login.js` → integrated into plugin `init`
- Move/adapt: `src/commands/poll.js` → integrated into plugin `poll`
- Move: `tests/extractor.test.js` → `tests/plugins/instagram/extractor.test.js`
- Delete: `src/commands/login.js`, `src/commands/poll.js`, `src/state.js`
- Delete: `tests/state.test.js`, `tests/downloader.test.js` (state now in core, downloader paths in core)

**Step 1: Create the plugin entry point**

```js
// plugins/instagram/index.js
import { chromium } from "playwright";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { fetchProfilePosts, fetchPostDetails, parsePost } from "./extractor.js";
import { downloadMedia } from "./downloader.js";

let browserContext = null;

export default {
  name: "instagram",
  description: "Instagram profile archiver",

  async init(config) {
    const profileDir = resolve(config.profile_dir || "./.browser-profile");

    console.log("Opening browser for Instagram login...");
    console.log(`Browser profile will be saved to: ${profileDir}`);

    const context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 900 },
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto("https://www.instagram.com/");

    console.log("Log in to Instagram in the browser window.");
    console.log("When you're done, close the browser window.");

    await new Promise((resolve) => {
      context.on("close", resolve);
    });

    console.log("Session saved. You can now run: postkeeper poll instagram");
  },

  async status(config) {
    const profileDir = resolve(config.profile_dir || "./.browser-profile");
    if (!existsSync(profileDir)) {
      return { ok: false, message: "No browser profile found. Run: postkeeper init instagram" };
    }

    let context;
    try {
      context = await chromium.launchPersistentContext(profileDir, { headless: true });
      const page = await context.newPage();
      await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);

      // Check if we're logged in by looking for the profile icon or login form
      const loggedIn = await page.evaluate(() => {
        return !document.querySelector('input[name="username"]');
      });

      await context.close();
      return loggedIn
        ? { ok: true, message: "Session valid" }
        : { ok: false, message: "Session expired. Run: postkeeper init instagram" };
    } catch (err) {
      if (context) await context.close().catch(() => {});
      return { ok: false, message: err.message };
    }
  },

  async poll(config, context) {
    const profiles = config.profiles || [];
    if (profiles.length === 0) {
      context.log("No profiles configured.");
      return { posts: [], state: context.state };
    }

    const profileDir = resolve(config.profile_dir || "./.browser-profile");
    browserContext = await chromium.launchPersistentContext(profileDir, { headless: true });
    const page = await browserContext.newPage();

    const allPosts = [];
    const state = { ...context.state };

    try {
      for (const username of profiles) {
        context.log(`Checking @${username}...`);

        try {
          const lastSeen = state[username] || null;
          const postNodes = await fetchProfilePosts(page, username, lastSeen);
          context.log(`Found ${postNodes.length} post(s)`);

          // Filter to new posts, sort oldest-first
          const newPosts = postNodes
            .filter((node) => {
              const ts = new Date(node.taken_at * 1000).toISOString();
              return !lastSeen || new Date(ts) > new Date(lastSeen);
            })
            .sort((a, b) => a.taken_at - b.taken_at);

          if (newPosts.length === 0) {
            context.log("No new posts.");
            continue;
          }

          context.log(`${newPosts.length} new post(s) to download`);

          for (const node of newPosts) {
            const shortcode = node.code;
            context.log(`Processing post ${shortcode}...`);

            const fullNode = await fetchPostDetails(page, shortcode);
            const rawNode = fullNode || node;
            const postData = parsePost(rawNode);

            // Download media to tmpDir
            const mediaFiles = await downloadMedia(postData.media, context.tmpDir, shortcode);

            allPosts.push({
              activity: postData,
              raw: rawNode,
              media: mediaFiles,
            });

            // Update state
            state[username] = postData.timestamp;

            // Rate limit delay
            await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
          }
        } catch (err) {
          context.log(`Error polling @${username}: ${err.message}`);
          continue;
        }

        // Delay between profiles
        await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));
      }
    } finally {
      await browserContext.close();
      browserContext = null;
    }

    return { posts: allPosts, state };
  },

  async shutdown() {
    if (browserContext) {
      await browserContext.close();
      browserContext = null;
    }
  },
};
```

**Step 2: Copy extractor.js to plugin directory**

Copy `src/extractor.js` to `plugins/instagram/extractor.js` unchanged. This file is already correct and tested.

```bash
mkdir -p plugins/instagram
cp src/extractor.js plugins/instagram/extractor.js
```

**Step 3: Create plugin-specific downloader**

The core now handles file storage. The plugin downloader only downloads media to a tmp directory and returns the file mappings.

```js
// plugins/instagram/downloader.js
import { mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

export async function downloadMedia(mediaItems, tmpDir, shortcode) {
  const mediaFiles = [];
  const downloadDir = join(tmpDir, shortcode);
  mkdirSync(downloadDir, { recursive: true });

  for (const item of mediaItems) {
    const filePath = join(downloadDir, item.file);
    const response = await fetch(item.url);
    if (!response.ok) {
      console.error(`  Failed to download ${item.url}: ${response.status}`);
      continue;
    }
    const fileStream = createWriteStream(filePath);
    await pipeline(response.body, fileStream);
    console.log(`  Downloaded: ${item.file}`);

    mediaFiles.push({
      relativePath: item.file,
      tmpPath: filePath,
    });
  }

  return mediaFiles;
}
```

**Step 4: Move extractor tests**

```bash
mkdir -p tests/plugins/instagram
cp tests/extractor.test.js tests/plugins/instagram/extractor.test.js
```

Update the import path in the copied test:

```js
// Change this line:
import { parsePost } from "../src/extractor.js";
// To:
import { parsePost } from "../../../plugins/instagram/extractor.js";
```

**Step 5: Run extractor tests to verify they still pass**

Run: `node --test tests/plugins/instagram/extractor.test.js`
Expected: All 4 tests PASS.

**Step 6: Delete old files that have been moved/replaced**

```bash
rm src/commands/login.js
rm src/commands/poll.js
rm src/state.js
rm src/downloader.js
rm tests/state.test.js
rm tests/downloader.test.js
rm tests/extractor.test.js
rmdir src/commands
```

**Step 7: Verify all tests pass**

Run: `node --test tests/`
Expected: All tests pass (config, core/plugins, core/as2, core/orchestrator, plugins/instagram/extractor).

**Step 8: Commit**

```bash
git add plugins/ tests/plugins/ src/ tests/
git add -u  # pick up deletions
git commit -m "feat: Instagram plugin with postkeeper interface"
```

---

### Task 7: Update README and Config

Update documentation and config for the new postkeeper structure.

**Files:**
- Modify: `README.md`
- Modify: `config.json`
- Modify: `.gitignore`

**Step 1: Update README.md**

Replace the instapost README with postkeeper documentation covering:
- What postkeeper is (local social media archiver, plugin-based)
- Setup (npm install, playwright install)
- Quick start (init, poll, status, list)
- Plugin system (how plugins work, directory convention)
- Output format (AS2 + raw, directory layout)
- Instagram plugin specifics (profiles config, browser login)
- Writing new plugins (interface contract)

**Step 2: Update config.json**

```json
{
  "archive_dir": "./archive",
  "plugins": {
    "instagram": {
      "profiles": [],
      "profile_dir": "./.browser-profile"
    }
  }
}
```

**Step 3: Update .gitignore**

```
node_modules/
.browser-profile/
output/
archive/
```

**Step 4: Commit**

```bash
git add README.md config.json .gitignore
git commit -m "docs: update README and config for postkeeper"
```

---

### Task 8: Migration of Existing Archive

Create a one-time migration script that converts existing `output/` posts (instapost format) to the new `archive/instagram/` layout with `.as2.json` + `.raw.json` files.

**Files:**
- Create: `scripts/migrate-from-instapost.js`

**Step 1: Write the migration script**

```js
#!/usr/bin/env node
// scripts/migrate-from-instapost.js
//
// Migrates existing instapost output/ to postkeeper archive/instagram/ format.
// - Reads each .json post file from output/posts/<username>/
// - Writes .as2.json (converted) and .raw.json (the original json as raw)
// - Copies media directories as-is
//
// Usage: node scripts/migrate-from-instapost.js [--dry-run]

import { readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { toAS2 } from "../src/core/as2.js";

const dryRun = process.argv.includes("--dry-run");
const sourceDir = "output/posts";
const targetDir = "archive/instagram/posts";

if (!existsSync(sourceDir)) {
  console.log("No output/posts directory found. Nothing to migrate.");
  process.exit(0);
}

const usernames = readdirSync(sourceDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

let totalPosts = 0;

for (const username of usernames) {
  const userSourceDir = join(sourceDir, username);
  const userTargetDir = join(targetDir, username);

  const jsonFiles = readdirSync(userSourceDir).filter((f) => f.endsWith(".json"));

  for (const jsonFile of jsonFiles) {
    const baseName = jsonFile.replace(".json", "");
    const post = JSON.parse(readFileSync(join(userSourceDir, jsonFile), "utf-8"));

    if (dryRun) {
      console.log(`Would migrate: ${username}/${jsonFile}`);
      totalPosts++;
      continue;
    }

    mkdirSync(userTargetDir, { recursive: true });

    // Write AS2
    const as2 = toAS2(post, "instagram");
    writeFileSync(join(userTargetDir, `${baseName}.as2.json`), JSON.stringify(as2, null, 2));

    // Write raw (the old json IS the raw data)
    writeFileSync(join(userTargetDir, `${baseName}.raw.json`), JSON.stringify(post, null, 2));

    // Copy media directory if it exists
    const mediaSourceDir = join(userSourceDir, baseName);
    if (existsSync(mediaSourceDir)) {
      const mediaTargetDir = join(userTargetDir, baseName);
      cpSync(mediaSourceDir, mediaTargetDir, { recursive: true });
    }

    totalPosts++;
  }

  if (!dryRun) {
    console.log(`Migrated ${jsonFiles.length} post(s) for @${username}`);
  }
}

console.log(`\n${dryRun ? "Would migrate" : "Migrated"} ${totalPosts} total post(s).`);

// Migrate state
if (existsSync("output/state.json") && !dryRun) {
  mkdirSync("archive/instagram", { recursive: true });
  cpSync("output/state.json", "archive/instagram/state.json");
  console.log("Migrated state.json");
}
```

**Step 2: Test with --dry-run**

Run: `node scripts/migrate-from-instapost.js --dry-run`
Expected: Lists all posts that would be migrated without writing anything.

**Step 3: Run the actual migration**

Run: `node scripts/migrate-from-instapost.js`
Expected: Creates `archive/instagram/posts/` with `.as2.json` and `.raw.json` for each post.

**Step 4: Verify a migrated post**

Pick any post and check:
- `.as2.json` has `@context`, `type: "Note"`, `generator.name: "Instagram"`
- `.raw.json` has the original instapost fields (`shortcode`, `media_type`, etc.)
- Media directory is intact

**Step 5: Commit**

```bash
git add scripts/migrate-from-instapost.js
git commit -m "feat: migration script from instapost to postkeeper format"
```

---

### Task 9: End-to-End Verification

No new files. Verify the full postkeeper flow works.

**Step 1: Run all unit tests**

Run: `node --test tests/`
Expected: All tests pass.

**Step 2: List plugins**

Run: `node src/cli.js list`
Expected: Shows "instagram - Instagram profile archiver"

**Step 3: Check status**

Run: `node src/cli.js status instagram`
Expected: "OK - Session valid" (assuming browser profile still works from earlier).

**Step 4: Poll (incremental)**

Run: `node src/cli.js poll instagram`
Expected: Checks each profile, finds 0 new posts (since we already have everything from the backfill).

**Step 5: Verify output format**

Check that `archive/instagram/posts/<username>/` has `.as2.json` files with correct AS2 format and `.raw.json` files with original Instagram data.

**Step 6: Clean up old output/ if migration was successful**

After verifying archive/ is correct, the old `output/` directory can be removed manually.

**Step 7: Final commit (if any tweaks needed)**

```bash
git add -A
git commit -m "chore: postkeeper refactor complete"
```
