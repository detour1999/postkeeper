# Facebook Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a live Facebook archiver plugin using Playwright to intercept GraphQL responses, following the same pattern as the Instagram plugin.

**Architecture:** Fat plugin with extractor, downloader, AS2 converter, and plugin interface. Playwright intercepts Facebook's GraphQL API responses as the page scrolls. Shared browser profile for persistent auth.

**Tech Stack:** Playwright, Node.js built-ins, AS2 (ActivityStreams 2.0)

---

### Task 1: Scaffold plugin and package.json

**Files:**
- Create: `plugins/facebook/package.json`

**Step 1: Create package.json**

```json
{
  "private": true,
  "type": "module",
  "dependencies": {
    "playwright": "^1.58.2"
  }
}
```

**Step 2: Install dependencies**

Run: `npm install --prefix plugins/facebook`

**Step 3: Commit**

```bash
git add plugins/facebook/package.json plugins/facebook/package-lock.json
git commit -m "chore: scaffold facebook plugin with playwright dep"
```

---

### Task 2: AS2 converter with tests (TDD)

**Files:**
- Create: `tests/plugins/facebook/as2.test.js`
- Create: `plugins/facebook/as2.js`

**Step 1: Write the failing tests**

```js
// tests/plugins/facebook/as2.test.js
import { test, describe } from "node:test";
import assert from "node:assert";
import { toAS2 } from "../../../plugins/facebook/as2.js";

describe("Facebook toAS2", () => {
  test("converts a text post to AS2", () => {
    const post = {
      postId: "pfbid02abc",
      profileUrl: "https://www.facebook.com/dylanr",
      profileName: "dylanr",
      timestamp: "2024-03-15T14:30:00.000Z",
      content: "Hello world",
      location: null,
      reactions: 42,
      comments: 3,
      media: [],
      sharedLink: null,
    };
    const as2 = toAS2(post);
    assert.strictEqual(as2["@context"], "https://www.w3.org/ns/activitystreams");
    assert.strictEqual(as2.type, "Note");
    assert.strictEqual(as2.id, "https://www.facebook.com/dylanr/posts/pfbid02abc");
    assert.strictEqual(as2.url, "https://www.facebook.com/dylanr/posts/pfbid02abc");
    assert.strictEqual(as2.published, "2024-03-15T14:30:00.000Z");
    assert.strictEqual(as2.attributedTo.name, "dylanr");
    assert.strictEqual(as2.attributedTo.url, "https://www.facebook.com/dylanr");
    assert.strictEqual(as2.content, "Hello world");
    assert.strictEqual(as2.likes.totalItems, 42);
    assert.strictEqual(as2.replies.totalItems, 3);
    assert.strictEqual(as2.generator.name, "Facebook");
    assert.strictEqual(as2.attachment.length, 0);
  });

  test("converts a photo post with media", () => {
    const post = {
      postId: "pfbid02xyz",
      profileUrl: "https://www.facebook.com/dylanr",
      profileName: "dylanr",
      timestamp: "2024-06-01T12:00:00.000Z",
      content: "Photo post",
      location: null,
      reactions: 10,
      comments: 1,
      media: [
        { type: "image", url: "https://cdn.fbcdn.net/img1.jpg", file: "1.jpg" },
        { type: "image", url: "https://cdn.fbcdn.net/img2.jpg", file: "2.jpg" },
      ],
      sharedLink: null,
    };
    const as2 = toAS2(post);
    assert.strictEqual(as2.attachment.length, 2);
    assert.strictEqual(as2.attachment[0].type, "Image");
    assert.strictEqual(as2.attachment[0].mediaType, "image/jpeg");
    assert.strictEqual(as2.attachment[0].url, "1.jpg");
    assert.strictEqual(as2.attachment[1].url, "2.jpg");
  });

  test("converts a video post", () => {
    const post = {
      postId: "pfbid02vid",
      profileUrl: "https://www.facebook.com/dylanr",
      profileName: "dylanr",
      timestamp: "2024-06-01T12:00:00.000Z",
      content: "Video post",
      location: null,
      reactions: 5,
      comments: 0,
      media: [{ type: "video", url: "https://cdn.fbcdn.net/vid.mp4", file: "1.mp4" }],
      sharedLink: null,
    };
    const as2 = toAS2(post);
    assert.strictEqual(as2.attachment[0].type, "Video");
    assert.strictEqual(as2.attachment[0].mediaType, "video/mp4");
  });

  test("includes shared link as attachment", () => {
    const post = {
      postId: "pfbid02link",
      profileUrl: "https://www.facebook.com/dylanr",
      profileName: "dylanr",
      timestamp: "2024-06-01T12:00:00.000Z",
      content: "Check this out",
      location: null,
      reactions: 0,
      comments: 0,
      media: [],
      sharedLink: { url: "https://example.com/article", title: "Cool Article" },
    };
    const as2 = toAS2(post);
    assert.strictEqual(as2.attachment.length, 1);
    assert.strictEqual(as2.attachment[0].type, "Link");
    assert.strictEqual(as2.attachment[0].href, "https://example.com/article");
    assert.strictEqual(as2.attachment[0].name, "Cool Article");
  });

  test("includes location when present", () => {
    const post = {
      postId: "pfbid02loc",
      profileUrl: "https://www.facebook.com/dylanr",
      profileName: "dylanr",
      timestamp: "2024-06-01T12:00:00.000Z",
      content: "At a place",
      location: { name: "Portland, Oregon" },
      reactions: 0,
      comments: 0,
      media: [],
      sharedLink: null,
    };
    const as2 = toAS2(post);
    assert.strictEqual(as2.location.type, "Place");
    assert.strictEqual(as2.location.name, "Portland, Oregon");
  });

  test("omits location when null", () => {
    const post = {
      postId: "pfbid02noloc",
      profileUrl: "https://www.facebook.com/dylanr",
      profileName: "dylanr",
      timestamp: "2024-06-01T12:00:00.000Z",
      content: "No location",
      location: null,
      reactions: 0,
      comments: 0,
      media: [],
      sharedLink: null,
    };
    const as2 = toAS2(post);
    assert.strictEqual(as2.location, undefined);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/plugins/facebook/as2.test.js`
Expected: FAIL (module not found)

**Step 3: Write the implementation**

```js
// plugins/facebook/as2.js
// ABOUTME: Converts parsed Facebook post data into ActivityStreams 2.0 format.
// ABOUTME: Handles text, photo, video, shared link, and check-in posts.

function mediaTypeToAS2(type) {
  if (type === "video") return { type: "Video", mediaType: "video/mp4" };
  return { type: "Image", mediaType: "image/jpeg" };
}

export function toAS2(post) {
  const postUrl = `${post.profileUrl}/posts/${post.postId}`;

  const attachment = post.media.map((m) => ({
    ...mediaTypeToAS2(m.type),
    url: m.file,
  }));

  if (post.sharedLink) {
    attachment.push({
      type: "Link",
      href: post.sharedLink.url,
      name: post.sharedLink.title || "",
    });
  }

  const as2 = {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Note",
    id: postUrl,
    url: postUrl,
    published: post.timestamp,
    attributedTo: {
      type: "Person",
      name: post.profileName,
      url: post.profileUrl,
    },
    content: post.content,
    attachment,
    likes: { type: "Collection", totalItems: post.reactions || 0 },
    replies: { type: "Collection", totalItems: post.comments || 0 },
    generator: { type: "Application", name: "Facebook" },
  };

  if (post.location) {
    as2.location = { type: "Place", name: post.location.name };
  }

  return as2;
}
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/plugins/facebook/as2.test.js`
Expected: PASS (all 6 tests)

**Step 5: Commit**

```bash
git add plugins/facebook/as2.js tests/plugins/facebook/as2.test.js
git commit -m "feat(facebook): add AS2 converter with tests"
```

---

### Task 3: Downloader (copy from Instagram)

**Files:**
- Create: `plugins/facebook/downloader.js`

The Instagram downloader is generic — it takes media items with `{ file, url }`, downloads to a tmpDir subdirectory, and returns file mappings. We can use the exact same module.

**Step 1: Copy the downloader**

Copy `plugins/instagram/downloader.js` to `plugins/facebook/downloader.js` and update only the ABOUTME comments.

```js
// plugins/facebook/downloader.js
// ABOUTME: Downloads media files from Facebook CDN URLs to a temp directory.
// ABOUTME: Returns file mappings for the orchestrator to move to the archive.
import { mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

export async function downloadMedia(mediaItems, tmpDir, postId, log = console.log) {
  const mediaFiles = [];
  const downloadDir = join(tmpDir, postId);
  mkdirSync(downloadDir, { recursive: true });

  for (const item of mediaItems) {
    const filePath = join(downloadDir, item.file);
    const response = await fetch(item.url);
    if (!response.ok) {
      log(`  Failed to download ${item.url}: ${response.status}`);
      continue;
    }
    const fileStream = createWriteStream(filePath);
    await pipeline(response.body, fileStream);
    log(`  Downloaded: ${item.file}`);

    mediaFiles.push({
      relativePath: item.file,
      tmpPath: filePath,
    });
  }

  return mediaFiles;
}
```

**Step 2: Verify existing downloader tests still pass**

Run: `npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add plugins/facebook/downloader.js
git commit -m "feat(facebook): add media downloader"
```

---

### Task 4: Extractor — parsePost (TDD)

This is the part that parses Facebook's GraphQL response nodes into our clean post format. The exact GraphQL shape will need to be discovered by intercepting real responses, but we can write the parser and tests against a plausible structure now, then adjust when we see real data.

**Files:**
- Create: `tests/plugins/facebook/extractor.test.js`
- Create: `plugins/facebook/extractor.js`

**Step 1: Write the failing tests**

```js
// tests/plugins/facebook/extractor.test.js
import { test, describe } from "node:test";
import assert from "node:assert";
import { parsePost } from "../../../plugins/facebook/extractor.js";

describe("Facebook parsePost", () => {
  test("parses a text-only post", () => {
    const node = {
      post_id: "pfbid02abc",
      creation_time: 1710510600, // 2024-03-15T14:30:00Z
      message: { text: "Hello world" },
      feedback: { reaction_count: { count: 42 }, comment_count: { total_count: 3 } },
      attached_media: [],
      attached_link: null,
      place: null,
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.strictEqual(post.postId, "pfbid02abc");
    assert.strictEqual(post.content, "Hello world");
    assert.strictEqual(post.timestamp, "2024-03-15T14:30:00.000Z");
    assert.strictEqual(post.reactions, 42);
    assert.strictEqual(post.comments, 3);
    assert.strictEqual(post.media.length, 0);
    assert.strictEqual(post.sharedLink, null);
    assert.strictEqual(post.location, null);
  });

  test("parses a photo post", () => {
    const node = {
      post_id: "pfbid02photo",
      creation_time: 1710510600,
      message: { text: "Photo!" },
      feedback: { reaction_count: { count: 5 }, comment_count: { total_count: 0 } },
      attached_media: [
        { media: { image: { uri: "https://cdn.fbcdn.net/img1.jpg" }, __typename: "Photo" } },
        { media: { image: { uri: "https://cdn.fbcdn.net/img2.jpg" }, __typename: "Photo" } },
      ],
      attached_link: null,
      place: null,
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.strictEqual(post.media.length, 2);
    assert.strictEqual(post.media[0].type, "image");
    assert.strictEqual(post.media[0].url, "https://cdn.fbcdn.net/img1.jpg");
    assert.strictEqual(post.media[0].file, "1.jpg");
    assert.strictEqual(post.media[1].file, "2.jpg");
  });

  test("parses a video post", () => {
    const node = {
      post_id: "pfbid02vid",
      creation_time: 1710510600,
      message: { text: "Video!" },
      feedback: { reaction_count: { count: 0 }, comment_count: { total_count: 0 } },
      attached_media: [
        { media: { playable_url: "https://cdn.fbcdn.net/vid.mp4", __typename: "Video" } },
      ],
      attached_link: null,
      place: null,
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.strictEqual(post.media.length, 1);
    assert.strictEqual(post.media[0].type, "video");
    assert.strictEqual(post.media[0].url, "https://cdn.fbcdn.net/vid.mp4");
    assert.strictEqual(post.media[0].file, "1.mp4");
  });

  test("parses a shared link", () => {
    const node = {
      post_id: "pfbid02link",
      creation_time: 1710510600,
      message: { text: "Check this out" },
      feedback: { reaction_count: { count: 0 }, comment_count: { total_count: 0 } },
      attached_media: [],
      attached_link: { url: "https://example.com/article", title: "Cool Article" },
      place: null,
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.deepStrictEqual(post.sharedLink, { url: "https://example.com/article", title: "Cool Article" });
  });

  test("parses a check-in post", () => {
    const node = {
      post_id: "pfbid02loc",
      creation_time: 1710510600,
      message: { text: "At a place" },
      feedback: { reaction_count: { count: 0 }, comment_count: { total_count: 0 } },
      attached_media: [],
      attached_link: null,
      place: { name: "Portland, Oregon" },
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.deepStrictEqual(post.location, { name: "Portland, Oregon" });
  });

  test("handles missing message gracefully", () => {
    const node = {
      post_id: "pfbid02nomsg",
      creation_time: 1710510600,
      message: null,
      feedback: { reaction_count: { count: 0 }, comment_count: { total_count: 0 } },
      attached_media: [],
      attached_link: null,
      place: null,
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.strictEqual(post.content, "");
  });

  test("handles missing feedback gracefully", () => {
    const node = {
      post_id: "pfbid02nofb",
      creation_time: 1710510600,
      message: { text: "Hi" },
      feedback: null,
      attached_media: [],
      attached_link: null,
      place: null,
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.strictEqual(post.reactions, 0);
    assert.strictEqual(post.comments, 0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/plugins/facebook/extractor.test.js`
Expected: FAIL (module not found)

**Step 3: Write the implementation**

```js
// plugins/facebook/extractor.js
// ABOUTME: Extracts and parses Facebook post data from GraphQL API responses.
// ABOUTME: Handles profile scrolling, post detail fetching, and raw node parsing.

/**
 * Parse a raw Facebook GraphQL post node into our clean post format.
 * The exact field names may need adjustment after inspecting real GraphQL responses.
 */
export function parsePost(node, profileUrl, profileName) {
  const content = node.message?.text || "";
  const timestamp = new Date(node.creation_time * 1000).toISOString();

  const media = (node.attached_media || []).map((item, i) => {
    const m = item.media || item;
    const isVideo = m.__typename === "Video" || m.playable_url;
    if (isVideo) {
      return { type: "video", url: m.playable_url, file: `${i + 1}.mp4` };
    }
    return { type: "image", url: m.image?.uri || m.uri, file: `${i + 1}.jpg` };
  });

  const sharedLink = node.attached_link
    ? { url: node.attached_link.url, title: node.attached_link.title || "" }
    : null;

  const location = node.place ? { name: node.place.name } : null;

  return {
    postId: node.post_id,
    profileUrl,
    profileName,
    timestamp,
    content,
    location,
    reactions: node.feedback?.reaction_count?.count || 0,
    comments: node.feedback?.comment_count?.total_count || 0,
    media,
    sharedLink,
  };
}

/**
 * Fetch posts from a Facebook profile by intercepting GraphQL responses.
 * Scrolls until we find posts older than lastSeenTimestamp, or no more pages.
 *
 * NOTE: The GraphQL response format needs to be discovered by intercepting
 * real responses. The field names and nesting may differ from what's assumed here.
 * This function will likely need adjustment after initial testing with real data.
 */
/* c8 ignore start -- requires Playwright browser page, tested manually */
export async function fetchProfilePosts(page, profileUrl, lastSeenTimestamp = null) {
  const posts = [];
  let batchReceived = false;
  let noNewBatches = 0;

  const handler = async (response) => {
    const url = response.url();
    if (!url.includes("/api/graphql") && !url.includes("/graphql/")) return;

    try {
      const json = await response.json();
      const str = JSON.stringify(json);
      // Look for timeline post nodes — exact key TBD from real responses
      if (str.includes("creation_time") && str.includes("post_id")) {
        // Walk the response tree to find post nodes
        const found = findPostNodes(json);
        for (const node of found) {
          if (node.post_id && !posts.some((p) => p.post_id === node.post_id)) {
            posts.push(node);
            batchReceived = true;
          }
        }
      }
    } catch {
      // Not the response we're looking for
    }
  };

  page.on("response", handler);

  try {
    await page.goto(profileUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    // Scroll to load more posts
    while (noNewBatches < 3) {
      if (lastSeenTimestamp) {
        const oldestPost = posts[posts.length - 1];
        if (oldestPost) {
          const oldestTs = new Date(oldestPost.creation_time * 1000).toISOString();
          if (oldestTs <= lastSeenTimestamp) {
            break;
          }
        }
      }

      batchReceived = false;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      const start = Date.now();
      while (!batchReceived && Date.now() - start < 10000) {
        await page.waitForTimeout(500);
      }

      if (!batchReceived) {
        noNewBatches++;
      } else {
        noNewBatches = 0;
      }

      await page.waitForTimeout(1000 + Math.random() * 1000);
    }
  } finally {
    page.removeListener("response", handler);
  }

  return posts;
}

/**
 * Recursively search a JSON object for post nodes.
 * A post node has at minimum: post_id and creation_time.
 */
function findPostNodes(obj, results = []) {
  if (!obj || typeof obj !== "object") return results;

  if (obj.post_id && obj.creation_time) {
    results.push(obj);
    return results;
  }

  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        findPostNodes(item, results);
      }
    } else if (val && typeof val === "object") {
      findPostNodes(val, results);
    }
  }

  return results;
}
/* c8 ignore stop */
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/plugins/facebook/extractor.test.js`
Expected: PASS (all 7 tests)

**Step 5: Commit**

```bash
git add plugins/facebook/extractor.js tests/plugins/facebook/extractor.test.js
git commit -m "feat(facebook): add post parser with tests"
```

---

### Task 5: Plugin interface (index.js)

**Files:**
- Create: `plugins/facebook/index.js`

This follows the exact same pattern as the Instagram plugin: init (browser login), status (session check), run (scroll + intercept + download), shutdown.

**Step 1: Write the plugin**

```js
// plugins/facebook/index.js
// ABOUTME: Facebook plugin for postkeeper — archives your own Facebook posts.
// ABOUTME: Uses Playwright to intercept GraphQL responses from the Facebook web app.
import { chromium } from "playwright";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { fetchProfilePosts, parsePost } from "./extractor.js";
import { downloadMedia } from "./downloader.js";
import { toAS2 } from "./as2.js";

let browserContext = null;

function profileNameFromUrl(url) {
  // Extract profile name from URL like "https://www.facebook.com/dylanr"
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  return segments[segments.length - 1] || "unknown";
}

export default {
  name: "facebook",
  description: "Facebook profile archiver",

  async init(config, context) {
    const profileDir = join(context.dataDir, "browser-profile");

    console.log("Opening browser for Facebook login...");
    console.log(`Browser profile will be saved to: ${profileDir}`);

    const browserCtx = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 900 },
    });

    const page = browserCtx.pages()[0] || await browserCtx.newPage();
    await page.goto("https://www.facebook.com/");

    console.log("Log in to Facebook in the browser window.");
    console.log("When you're done, close the browser window.");

    await new Promise((resolve) => {
      browserCtx.on("close", resolve);
    });

    console.log("Session saved. You can now run: postkeeper run facebook");
  },

  async status(config, context) {
    const profileDir = join(context.dataDir, "browser-profile");
    if (!existsSync(profileDir)) {
      return { ok: false, message: "No browser profile found. Run: postkeeper init facebook" };
    }

    let browserCtx;
    try {
      browserCtx = await chromium.launchPersistentContext(profileDir, { headless: true });
      const page = await browserCtx.newPage();
      await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);

      const loggedIn = await page.evaluate(() => {
        return !document.querySelector('input[name="email"]');
      });

      await browserCtx.close();
      return loggedIn
        ? { ok: true, message: "Session valid" }
        : { ok: false, message: "Session expired. Run: postkeeper init facebook" };
    } catch (err) {
      if (browserCtx) await browserCtx.close().catch(() => {});
      return { ok: false, message: err.message };
    }
  },

  async run(config, context) {
    const profiles = config.profiles || [];
    if (profiles.length === 0) {
      context.log("No profiles configured.");
      return { posts: [] };
    }

    const profileDir = join(context.dataDir, "browser-profile");
    browserContext = await chromium.launchPersistentContext(profileDir, { headless: true });
    const page = await browserContext.newPage();

    const allPosts = [];

    try {
      for (const profileUrl of profiles) {
        const profileName = profileNameFromUrl(profileUrl);
        context.log(`Checking ${profileName}...`);

        try {
          const lastSeen = context.latestByAuthor[profileName] || null;
          const postNodes = await fetchProfilePosts(page, profileUrl, lastSeen);
          context.log(`Found ${postNodes.length} post(s)`);

          const newPosts = postNodes
            .filter((node) => {
              const ts = new Date(node.creation_time * 1000).toISOString();
              return !lastSeen || new Date(ts) > new Date(lastSeen);
            })
            .sort((a, b) => a.creation_time - b.creation_time);

          if (newPosts.length === 0) {
            context.log("No new posts.");
            continue;
          }

          context.log(`${newPosts.length} new post(s) to download`);

          let consecutiveErrors = 0;

          for (const node of newPosts) {
            const postId = node.post_id;
            context.log(`Processing post ${postId}...`);

            let success = false;
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                if (attempt > 0) {
                  const backoff = (2 ** attempt) * 5000 + Math.random() * 5000;
                  context.log(`Retry ${attempt}/2 after ${Math.round(backoff / 1000)}s...`);
                  await new Promise((r) => setTimeout(r, backoff));
                }

                const postData = parsePost(node, profileUrl, profileName);
                const mediaFiles = await downloadMedia(postData.media, context.tmpDir, postId, context.log);

                const as2 = toAS2(postData);
                allPosts.push({
                  as2,
                  raw: node,
                  media: mediaFiles,
                });

                success = true;
                consecutiveErrors = 0;
                break;
              } catch (err) {
                context.log(`Attempt ${attempt + 1}/3 failed for ${postId}: ${err.message}`);
              }
            }

            if (!success) {
              consecutiveErrors++;
              context.log(`Skipping post ${postId} after 3 attempts`);
              if (consecutiveErrors >= 3) {
                context.log("3 consecutive failures — pausing this profile");
                break;
              }
            }

            // Delay scales up with number of posts processed to avoid rate limits
            const baseDelay = 3000 + Math.min(allPosts.length * 500, 7000);
            await new Promise((r) => setTimeout(r, baseDelay + Math.random() * 3000));
          }
        } catch (err) {
          context.log(`Error polling ${profileName}: ${err.message}`);
          continue;
        }

        await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));
      }
    } finally {
      await browserContext.close();
      browserContext = null;
    }

    return { posts: allPosts };
  },

  async shutdown() {
    if (browserContext) {
      await browserContext.close();
      browserContext = null;
    }
  },
};
```

**Step 2: Verify all tests pass**

Run: `npm test`
Expected: All tests pass (plugin discovered by loader)

**Step 3: Commit**

```bash
git add plugins/facebook/index.js
git commit -m "feat(facebook): add plugin interface with init/status/run/shutdown"
```

---

### Task 6: Update config and README

**Files:**
- Modify: `~/.config/postkeeper/config.json` (user's real config)
- Modify: `README.md`

**Step 1: Add facebook config**

Add to the user's config at `~/.config/postkeeper/config.json`:

```json
{
  "plugins": {
    "facebook": {
      "profiles": [
        "https://www.facebook.com/dylanr"
      ]
    }
  }
}
```

**Step 2: Add Facebook section to README.md**

Add a section describing the plugin, its config format, and init/run commands.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add Facebook plugin to README"
```

---

### Task 7: Init, explore, and adjust

This is the exploration task. Real Facebook GraphQL responses will almost certainly differ from what we've assumed above.

**Step 1: Run init to log in**

Run: `node src/cli.js init facebook`

Log in to Facebook in the browser window, then close it.

**Step 2: Run the plugin and capture raw responses**

Add temporary `console.log(JSON.stringify(json, null, 2))` in the extractor's response handler to see what Facebook actually sends back. Run:

Run: `node src/cli.js run facebook`

**Step 3: Adjust extractor.js and parsePost**

Based on real response shapes:
- Update field names in `parsePost()` to match actual GraphQL schema
- Update `findPostNodes()` search logic if needed
- Update `fetchProfilePosts()` timeline detection

**Step 4: Update tests to match real data**

Adjust test fixtures in `tests/plugins/facebook/extractor.test.js` to match the actual response format.

**Step 5: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add plugins/facebook/ tests/plugins/facebook/
git commit -m "fix(facebook): adjust parser to match real GraphQL responses"
```

---

### Task 8: Verify full pipeline and push

**Step 1: Run the full pipeline**

Run: `node src/cli.js run facebook`

Verify posts are archived to `~/.local/share/postkeeper/archive/facebook/posts/dylanr/`

**Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Push and create PR**

```bash
git push -u origin facebook-plugin
gh pr create --title "feat: add Facebook plugin" --body "..."
```
