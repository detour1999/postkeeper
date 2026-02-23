# InstaPost Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CLI tool that polls Instagram profiles and downloads new posts (media + metadata) locally.

**Architecture:** Node.js CLI with two commands (`login`, `poll`). Playwright persistent browser context for authentication. GraphQL response interception for structured data extraction. JSON output files with downloaded media.

**Tech Stack:** Node.js, Playwright (chromium), Commander.js (CLI), node:fs/path (file I/O)

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `src/cli.js`
- Create: `config.json`
- Create: `.gitignore`

**Step 1: Initialize the project**

```bash
cd /Users/dylanr/personal/instapost
npm init -y
```

**Step 2: Install dependencies**

```bash
npm install playwright commander
```

**Step 3: Create .gitignore**

```
node_modules/
.browser-profile/
output/
```

**Step 4: Create config.json with placeholder profiles**

```json
{
  "profiles": [],
  "output_dir": "./output",
  "profile_dir": "./.browser-profile"
}
```

**Step 5: Create CLI entrypoint at `src/cli.js`**

```js
#!/usr/bin/env node
import { Command } from "commander";
import { login } from "./commands/login.js";
import { poll } from "./commands/poll.js";

const program = new Command();

program
  .name("instapost")
  .description("Poll Instagram profiles and download new posts")
  .version("0.1.0");

program
  .command("login")
  .description("Open browser to log into Instagram")
  .action(login);

program
  .command("poll")
  .description("Poll profiles for new posts")
  .action(poll);

program.parse();
```

**Step 6: Add `"type": "module"` and `"bin"` to package.json**

Add to package.json:
```json
{
  "type": "module",
  "bin": {
    "instapost": "./src/cli.js"
  }
}
```

**Step 7: Commit**

```bash
git add package.json package-lock.json src/cli.js config.json .gitignore
git commit -m "feat: project scaffolding with CLI entrypoint"
```

---

### Task 2: Config Loader

**Files:**
- Create: `src/config.js`
- Create: `tests/config.test.js`

**Step 1: Write the failing test**

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

  test("loads config from a JSON file", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({
      profiles: ["user1", "user2"],
      output_dir: "./out",
      profile_dir: "./.bp"
    }));
    const config = loadConfig(configPath);
    assert.deepStrictEqual(config.profiles, ["user1", "user2"]);
    assert.strictEqual(config.output_dir, "./out");
    assert.strictEqual(config.profile_dir, "./.bp");
  });

  test("throws if config file is missing", () => {
    assert.throws(() => loadConfig(join(tmpDir, "nope.json")), /ENOENT|not found/i);
  });

  test("throws if profiles is empty", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify({ profiles: [] }));
    assert.throws(() => loadConfig(configPath), /profiles/i);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
node --test tests/config.test.js
```

Expected: FAIL — `../src/config.js` doesn't exist.

**Step 3: Write minimal implementation**

```js
// src/config.js
import { readFileSync } from "node:fs";

export function loadConfig(configPath) {
  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw);

  if (!config.profiles || config.profiles.length === 0) {
    throw new Error("config.profiles must contain at least one username");
  }

  return {
    profiles: config.profiles,
    output_dir: config.output_dir || "./output",
    profile_dir: config.profile_dir || "./.browser-profile",
  };
}
```

**Step 4: Run test to verify it passes**

```bash
node --test tests/config.test.js
```

Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add src/config.js tests/config.test.js
git commit -m "feat: config loader with validation"
```

---

### Task 3: State Manager

**Files:**
- Create: `src/state.js`
- Create: `tests/state.test.js`

**Step 1: Write the failing test**

```js
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
```

**Step 2: Run test to verify it fails**

```bash
node --test tests/state.test.js
```

Expected: FAIL — module doesn't exist.

**Step 3: Write minimal implementation**

```js
// src/state.js
import { readFileSync, writeFileSync } from "node:fs";

export function loadState(statePath) {
  try {
    return JSON.parse(readFileSync(statePath, "utf-8"));
  } catch {
    return {};
  }
}

export function saveState(statePath, state) {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function isNewPost(state, username, postTimestamp) {
  const lastSeen = state[username];
  if (!lastSeen) return true;
  return new Date(postTimestamp) > new Date(lastSeen);
}
```

**Step 4: Run test to verify it passes**

```bash
node --test tests/state.test.js
```

Expected: All 5 tests PASS.

**Step 5: Commit**

```bash
git add src/state.js tests/state.test.js
git commit -m "feat: state manager for tracking last seen posts"
```

---

### Task 4: Login Command

**Files:**
- Create: `src/commands/login.js`

No automated test for this task — it opens a real browser for manual login. We'll verify it works manually.

**Step 1: Create the login command**

```js
// src/commands/login.js
import { chromium } from "playwright";
import { loadConfig } from "../config.js";
import { resolve } from "node:path";

export async function login() {
  const config = loadConfig("config.json");
  const profileDir = resolve(config.profile_dir);

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

  console.log("Session saved. You can now run: instapost poll");
}
```

**Step 2: Verify it works manually**

Add at least one profile to `config.json`, then run:

```bash
node src/cli.js login
```

Expected: Browser opens to Instagram. Log in manually. Close browser. See "Session saved" message.

**Step 3: Commit**

```bash
git add src/commands/login.js
git commit -m "feat: login command with persistent browser context"
```

---

### Task 5: Post Extractor (GraphQL Interception)

**Files:**
- Create: `src/extractor.js`
- Create: `tests/extractor.test.js`

This is the core module. It takes a Playwright page, navigates to a profile, intercepts GraphQL responses, and returns structured post data.

**Step 1: Write the failing test for post data parsing**

We can't test the Playwright navigation in a unit test, but we CAN test the function that parses Instagram's GraphQL response JSON into our clean post format.

```js
// tests/extractor.test.js
import { test, describe } from "node:test";
import assert from "node:assert";
import { parsePostFromGraphQL } from "../src/extractor.js";

describe("parsePostFromGraphQL", () => {
  test("parses a single image post", () => {
    const graphqlNode = {
      id: "12345",
      shortcode: "ABC123",
      taken_at_timestamp: 1740000000,
      edge_media_to_caption: { edges: [{ node: { text: "Hello world" } }] },
      display_url: "https://example.com/img.jpg",
      is_video: false,
      __typename: "GraphImage",
      location: { name: "Portland", id: "99" },
      edge_media_to_tagged_user: { edges: [{ node: { user: { username: "friend1" } } }] },
      accessibility_caption: "A photo of a sunset",
      edge_media_preview_like: { count: 10 },
      edge_media_to_comment: { count: 3 },
      owner: { username: "testuser" },
    };

    const post = parsePostFromGraphQL(graphqlNode);

    assert.strictEqual(post.shortcode, "ABC123");
    assert.strictEqual(post.url, "https://www.instagram.com/p/ABC123/");
    assert.strictEqual(post.id, "12345");
    assert.strictEqual(post.caption, "Hello world");
    assert.strictEqual(post.media_type, "image");
    assert.strictEqual(post.media.length, 1);
    assert.strictEqual(post.media[0].type, "image");
    assert.strictEqual(post.location.name, "Portland");
    assert.deepStrictEqual(post.tagged_users, ["friend1"]);
    assert.strictEqual(post.alt_text, "A photo of a sunset");
    assert.strictEqual(post.likes, 10);
    assert.strictEqual(post.comments, 3);
  });

  test("parses a carousel post with sidecar children", () => {
    const graphqlNode = {
      id: "67890",
      shortcode: "XYZ789",
      taken_at_timestamp: 1740000000,
      edge_media_to_caption: { edges: [{ node: { text: "Carousel!" } }] },
      display_url: "https://example.com/img1.jpg",
      __typename: "GraphSidecar",
      is_video: false,
      location: null,
      edge_media_to_tagged_user: { edges: [] },
      accessibility_caption: null,
      edge_media_preview_like: { count: 5 },
      edge_media_to_comment: { count: 1 },
      owner: { username: "testuser" },
      edge_sidecar_to_children: {
        edges: [
          { node: { display_url: "https://example.com/img1.jpg", is_video: false } },
          { node: { display_url: "https://example.com/img2.jpg", is_video: false } },
          { node: { video_url: "https://example.com/vid.mp4", display_url: "https://example.com/thumb.jpg", is_video: true } },
        ],
      },
    };

    const post = parsePostFromGraphQL(graphqlNode);

    assert.strictEqual(post.media_type, "carousel");
    assert.strictEqual(post.media.length, 3);
    assert.strictEqual(post.media[0].type, "image");
    assert.strictEqual(post.media[1].type, "image");
    assert.strictEqual(post.media[2].type, "video");
    assert.strictEqual(post.media[2].url, "https://example.com/vid.mp4");
  });

  test("parses a video post", () => {
    const graphqlNode = {
      id: "11111",
      shortcode: "VID111",
      taken_at_timestamp: 1740000000,
      edge_media_to_caption: { edges: [] },
      display_url: "https://example.com/thumb.jpg",
      video_url: "https://example.com/video.mp4",
      is_video: true,
      __typename: "GraphVideo",
      location: null,
      edge_media_to_tagged_user: { edges: [] },
      accessibility_caption: null,
      edge_media_preview_like: { count: 0 },
      edge_media_to_comment: { count: 0 },
      owner: { username: "testuser" },
    };

    const post = parsePostFromGraphQL(graphqlNode);

    assert.strictEqual(post.media_type, "video");
    assert.strictEqual(post.media.length, 1);
    assert.strictEqual(post.media[0].type, "video");
    assert.strictEqual(post.media[0].url, "https://example.com/video.mp4");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
node --test tests/extractor.test.js
```

Expected: FAIL — module doesn't exist.

**Step 3: Write implementation**

```js
// src/extractor.js

/**
 * Parse an Instagram GraphQL media node into our clean post format.
 */
export function parsePostFromGraphQL(node) {
  const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text || "";
  const timestamp = new Date(node.taken_at_timestamp * 1000).toISOString();
  const username = node.owner?.username || "";

  let media_type;
  let media = [];

  if (node.__typename === "GraphSidecar" || node.edge_sidecar_to_children) {
    media_type = "carousel";
    const children = node.edge_sidecar_to_children?.edges || [];
    media = children.map((edge, i) => {
      const child = edge.node;
      if (child.is_video) {
        return { type: "video", url: child.video_url, file: `${i + 1}.mp4` };
      }
      return { type: "image", url: child.display_url, file: `${i + 1}.jpg` };
    });
  } else if (node.is_video) {
    media_type = "video";
    media = [{ type: "video", url: node.video_url, file: "1.mp4" }];
  } else {
    media_type = "image";
    media = [{ type: "image", url: node.display_url, file: "1.jpg" }];
  }

  const tagged_users = (node.edge_media_to_tagged_user?.edges || [])
    .map((e) => e.node.user.username);

  return {
    shortcode: node.shortcode,
    url: `https://www.instagram.com/p/${node.shortcode}/`,
    id: node.id,
    username,
    timestamp,
    caption,
    location: node.location ? { name: node.location.name, id: node.location.id } : null,
    tagged_users,
    alt_text: node.accessibility_caption || null,
    likes: node.edge_media_preview_like?.count || 0,
    comments: node.edge_media_to_comment?.count || 0,
    media_type,
    media,
  };
}

/**
 * Fetch the post list from a profile page by intercepting GraphQL responses.
 * Returns an array of raw GraphQL media nodes.
 */
export async function fetchProfilePosts(page, username) {
  const posts = [];

  // Set up response interception before navigating
  const responsePromise = new Promise((resolve) => {
    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("/graphql/query") || url.includes("/api/graphql")) {
        try {
          const json = await response.json();
          // Profile page query contains edge_owner_to_timeline_media
          const user = json?.data?.user;
          const media = user?.edge_owner_to_timeline_media;
          if (media?.edges) {
            for (const edge of media.edges) {
              posts.push(edge.node);
            }
            resolve();
          }
        } catch {
          // Not the response we're looking for
        }
      }
    });
  });

  await page.goto(`https://www.instagram.com/${username}/`, {
    waitUntil: "networkidle",
  });

  // Wait for GraphQL response or timeout after 15s
  await Promise.race([responsePromise, new Promise((r) => setTimeout(r, 15000))]);

  return posts;
}

/**
 * Fetch full post details (including all carousel items) by navigating to the post permalink.
 * Returns the full GraphQL media node.
 */
export async function fetchPostDetails(page, shortcode) {
  let postNode = null;

  const responsePromise = new Promise((resolve) => {
    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("/graphql/query") || url.includes("/api/graphql")) {
        try {
          const json = await response.json();
          // Post detail query contains shortcode_media
          const media = json?.data?.shortcode_media;
          if (media && media.shortcode === shortcode) {
            postNode = media;
            resolve();
          }
        } catch {
          // Not the response we're looking for
        }
      }
    });
  });

  await page.goto(`https://www.instagram.com/p/${shortcode}/`, {
    waitUntil: "networkidle",
  });

  await Promise.race([responsePromise, new Promise((r) => setTimeout(r, 15000))]);

  return postNode;
}
```

**Step 4: Run test to verify it passes**

```bash
node --test tests/extractor.test.js
```

Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add src/extractor.js tests/extractor.test.js
git commit -m "feat: post extractor with GraphQL parsing and interception"
```

---

### Task 6: Media Downloader

**Files:**
- Create: `src/downloader.js`
- Create: `tests/downloader.test.js`

**Step 1: Write the failing test**

```js
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
```

**Step 2: Run test to verify it fails**

```bash
node --test tests/downloader.test.js
```

Expected: FAIL — module doesn't exist.

**Step 3: Write implementation**

```js
// src/downloader.js
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { join, dirname } from "node:path";
import { pipeline } from "node:stream/promises";

export function buildPostOutputPath(outputDir, post) {
  const datePrefix = post.timestamp.slice(0, 10); // YYYY-MM-DD
  const baseName = `${datePrefix}-${post.shortcode}`;
  const userDir = join(outputDir, "posts", post.username);
  const jsonPath = join(userDir, `${baseName}.json`);
  const mediaDir = join(userDir, baseName);

  return { jsonPath, mediaDir };
}

export function writePostJSON(jsonPath, post) {
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(post, null, 2));
}

export async function downloadMedia(mediaItems, mediaDir) {
  mkdirSync(mediaDir, { recursive: true });

  for (const item of mediaItems) {
    const filePath = join(mediaDir, item.file);
    const response = await fetch(item.url);
    if (!response.ok) {
      console.error(`Failed to download ${item.url}: ${response.status}`);
      continue;
    }
    const fileStream = createWriteStream(filePath);
    await pipeline(response.body, fileStream);
    console.log(`  Downloaded: ${item.file}`);
  }
}
```

**Step 4: Run test to verify it passes**

```bash
node --test tests/downloader.test.js
```

Expected: All 2 tests PASS.

**Step 5: Commit**

```bash
git add src/downloader.js tests/downloader.test.js
git commit -m "feat: media downloader with post output path builder"
```

---

### Task 7: Poll Command (Wire It All Together)

**Files:**
- Create: `src/commands/poll.js`

This task wires together config, state, extractor, and downloader into the `poll` command.

**Step 1: Write the poll command**

```js
// src/commands/poll.js
import { chromium } from "playwright";
import { resolve, join } from "node:path";
import { loadConfig } from "../config.js";
import { loadState, saveState, isNewPost } from "../state.js";
import {
  fetchProfilePosts,
  fetchPostDetails,
  parsePostFromGraphQL,
} from "../extractor.js";
import {
  buildPostOutputPath,
  writePostJSON,
  downloadMedia,
} from "../downloader.js";

export async function poll() {
  const config = loadConfig("config.json");
  const outputDir = resolve(config.output_dir);
  const profileDir = resolve(config.profile_dir);
  const statePath = join(outputDir, "state.json");

  const state = loadState(statePath);

  console.log(`Polling ${config.profiles.length} profile(s)...`);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
  });

  const page = await context.newPage();

  try {
    for (const username of config.profiles) {
      console.log(`\nChecking @${username}...`);

      const postNodes = await fetchProfilePosts(page, username);
      console.log(`  Found ${postNodes.length} recent post(s)`);

      // Filter to new posts and sort oldest-first so we process in order
      const newPosts = postNodes
        .filter((node) => {
          const ts = new Date(node.taken_at_timestamp * 1000).toISOString();
          return isNewPost(state, username, ts);
        })
        .sort((a, b) => a.taken_at_timestamp - b.taken_at_timestamp);

      if (newPosts.length === 0) {
        console.log("  No new posts.");
        continue;
      }

      console.log(`  ${newPosts.length} new post(s) to download`);

      for (const node of newPosts) {
        const shortcode = node.shortcode;
        console.log(`  Processing post ${shortcode}...`);

        // Fetch full details (needed for carousel children)
        const fullNode = await fetchPostDetails(page, shortcode);
        const postData = parsePostFromGraphQL(fullNode || node);

        const paths = buildPostOutputPath(outputDir, postData);
        writePostJSON(paths.jsonPath, postData);
        await downloadMedia(postData.media, paths.mediaDir);

        // Update state to this post's timestamp
        state[username] = postData.timestamp;
        saveState(statePath, state);

        console.log(`  Saved: ${paths.jsonPath}`);
      }
    }
  } finally {
    await context.close();
  }

  console.log("\nDone.");
}
```

**Step 2: Verify manually**

Make sure `config.json` has at least one real profile, and that you've run `instapost login` first. Then:

```bash
node src/cli.js poll
```

Expected: Posts are detected, media downloaded, JSON files written under `output/posts/<username>/`.

**Step 3: Commit**

```bash
git add src/commands/poll.js
git commit -m "feat: poll command wiring config, state, extractor, and downloader"
```

---

### Task 8: End-to-End Manual Test

No new files. This is a verification step.

**Step 1: Ensure config.json has real profile(s)**

Edit `config.json` with your actual Instagram usernames.

**Step 2: Login**

```bash
node src/cli.js login
```

Log in, close browser.

**Step 3: First poll**

```bash
node src/cli.js poll
```

Verify:
- Posts are detected and listed
- JSON files appear in `output/posts/<username>/`
- Media files (images/videos) are downloaded
- `output/state.json` is created with timestamps

**Step 4: Second poll (should find no new posts)**

```bash
node src/cli.js poll
```

Verify: "No new posts." for each profile.

**Step 5: Commit any config tweaks**

```bash
git add -A && git commit -m "chore: verified end-to-end polling works"
```

---

### Task 9: Robustness Improvements

**Files:**
- Modify: `src/extractor.js`
- Modify: `src/commands/poll.js`

**Step 1: Add fallback for when GraphQL interception misses**

Instagram sometimes serves data embedded in the initial HTML as `window.__additionalData` or `window._sharedData`. Add a fallback in `fetchProfilePosts` that checks for this if the GraphQL interception times out:

```js
// Add to fetchProfilePosts, after the Promise.race timeout:
if (posts.length === 0) {
  // Fallback: try to extract from page's embedded JSON
  const embedded = await page.evaluate(() => {
    try {
      const scripts = document.querySelectorAll('script[type="application/json"]');
      for (const script of scripts) {
        const data = JSON.parse(script.textContent);
        // Walk the object looking for edge_owner_to_timeline_media
        const str = JSON.stringify(data);
        if (str.includes("edge_owner_to_timeline_media")) {
          return data;
        }
      }
    } catch {}
    return null;
  });
  // Parse embedded data if found (structure varies, best-effort)
  if (embedded) {
    console.log("  Using embedded page data as fallback");
    // Extract posts from embedded structure — implementation depends on current IG format
  }
}
```

**Step 2: Add delay between profile navigations**

In `poll.js`, add a random delay (2-5 seconds) between profiles to avoid triggering rate limits:

```js
// Add after processing each profile in the for loop:
if (config.profiles.indexOf(username) < config.profiles.length - 1) {
  const delay = 2000 + Math.random() * 3000;
  console.log(`  Waiting ${(delay / 1000).toFixed(1)}s...`);
  await new Promise((r) => setTimeout(r, delay));
}
```

**Step 3: Add delay between post detail fetches**

Similar 1-3 second random delay between fetching individual post details.

**Step 4: Commit**

```bash
git add src/extractor.js src/commands/poll.js
git commit -m "feat: add fallback extraction and rate-limit delays"
```
