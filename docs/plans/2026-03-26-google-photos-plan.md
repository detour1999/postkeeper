# Google Photos Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Google Photos plugin that archives all photos and videos from a user's Google Photos account using the authed browser pattern.

**Architecture:** Same structure as Instagram/Facebook plugins — persistent Playwright browser profile for auth, headless runs that scroll the photo grid to discover items, visit detail pages for metadata, download media, and return AS2 Notes. A checkpoint file (`progress.json`) enables resumable runs across crashes. See `docs/plans/2026-03-26-google-photos-design.md` for full design.

**Tech Stack:** Node.js (ES modules), Playwright (chromium), node:test + node:assert

---

### Task 1: Plugin Scaffold and Package.json

**Files:**
- Create: `plugins/google-photos/package.json`

**Step 1: Create the package.json**

```json
{
  "name": "postkeeper-plugin-google-photos",
  "private": true,
  "type": "module",
  "dependencies": {
    "playwright": "^1.52.0"
  }
}
```

Check other plugins for the current Playwright version:
```bash
cat plugins/instagram/package.json
```
Use that same version.

**Step 2: Install dependencies**

```bash
cd plugins/google-photos && npm install && cd ../..
```

**Step 3: Commit**

```bash
git add plugins/google-photos/package.json plugins/google-photos/package-lock.json
git commit -m "feat(google-photos): add plugin scaffold with package.json"
```

---

### Task 2: AS2 Converter

This is a pure function — fully testable without a browser.

**Files:**
- Create: `plugins/google-photos/as2.js`
- Create: `tests/plugins/google-photos/as2.test.js`

**Step 1: Write the failing tests**

Create `tests/plugins/google-photos/as2.test.js`:

```js
// ABOUTME: Tests for the Google Photos AS2 converter.
// ABOUTME: Validates conversion of photo/video items to ActivityStreams 2.0 format.
import { test, describe } from "node:test";
import assert from "node:assert";
import { toAS2 } from "../../../plugins/google-photos/as2.js";

function makeItem(overrides = {}) {
  return {
    itemId: "AF1QipN_abc123",
    url: "https://photos.google.com/photo/AF1QipN_abc123",
    dateTaken: "2024-03-15T14:30:00.000Z",
    description: "Sunset at the beach",
    filename: "IMG_1234.jpg",
    mediaType: "image",
    location: { name: "Cannon Beach, Oregon", latitude: 45.8918, longitude: -123.9615 },
    people: ["Alice", "Bob"],
    camera: { model: "Pixel 8 Pro", aperture: "f/1.68", focalLength: "6.9mm", iso: "58" },
    resolution: { width: 4080, height: 3072 },
    fileSize: "4.2 MB",
    accountName: "Dylan Richard",
    ...overrides,
  };
}

describe("Google Photos toAS2", () => {
  test("converts a photo item to AS2 Note", () => {
    const as2 = toAS2(makeItem());
    assert.strictEqual(as2["@context"], "https://www.w3.org/ns/activitystreams");
    assert.strictEqual(as2.type, "Note");
    assert.strictEqual(as2.id, "google-photos:AF1QipN_abc123");
    assert.strictEqual(as2.url, "https://photos.google.com/photo/AF1QipN_abc123");
    assert.strictEqual(as2.published, "2024-03-15T14:30:00.000Z");
    assert.strictEqual(as2.content, "Sunset at the beach");
    assert.strictEqual(as2.attributedTo.name, "Dylan Richard");
    assert.strictEqual(as2.attributedTo.url, "https://photos.google.com");
    assert.strictEqual(as2.generator.name, "Google Photos");
  });

  test("includes photo as Image attachment", () => {
    const as2 = toAS2(makeItem());
    assert.strictEqual(as2.attachment.length, 1);
    assert.strictEqual(as2.attachment[0].type, "Image");
    assert.strictEqual(as2.attachment[0].mediaType, "image/jpeg");
    assert.strictEqual(as2.attachment[0].url, "1.jpg");
  });

  test("includes video as Video attachment", () => {
    const as2 = toAS2(makeItem({ mediaType: "video", filename: "VID_1234.mp4" }));
    assert.strictEqual(as2.attachment[0].type, "Video");
    assert.strictEqual(as2.attachment[0].mediaType, "video/mp4");
    assert.strictEqual(as2.attachment[0].url, "1.mp4");
  });

  test("includes location with coordinates", () => {
    const as2 = toAS2(makeItem());
    assert.strictEqual(as2.location.type, "Place");
    assert.strictEqual(as2.location.name, "Cannon Beach, Oregon");
    assert.strictEqual(as2.location.latitude, 45.8918);
    assert.strictEqual(as2.location.longitude, -123.9615);
  });

  test("omits location when null", () => {
    const as2 = toAS2(makeItem({ location: null }));
    assert.strictEqual(as2.location, undefined);
  });

  test("includes people as Person tags", () => {
    const as2 = toAS2(makeItem());
    assert.strictEqual(as2.tag.length, 2);
    assert.strictEqual(as2.tag[0].type, "Person");
    assert.strictEqual(as2.tag[0].name, "Alice");
    assert.strictEqual(as2.tag[1].name, "Bob");
  });

  test("handles no people", () => {
    const as2 = toAS2(makeItem({ people: [] }));
    assert.strictEqual(as2.tag.length, 0);
  });

  test("handles empty description", () => {
    const as2 = toAS2(makeItem({ description: "" }));
    assert.strictEqual(as2.content, "");
  });

  test("handles null dateTaken", () => {
    const as2 = toAS2(makeItem({ dateTaken: null }));
    assert.strictEqual(as2.published, null);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
node --test tests/plugins/google-photos/as2.test.js
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `plugins/google-photos/as2.js`:

```js
// ABOUTME: Converts Google Photos item objects into ActivityStreams 2.0 format.
// ABOUTME: Produces Note type with photo/video as attachment, location, and people tags.

export function toAS2(item) {
  const isVideo = item.mediaType === "video";
  const file = isVideo ? "1.mp4" : "1.jpg";
  const attachment = [{
    type: isVideo ? "Video" : "Image",
    mediaType: isVideo ? "video/mp4" : "image/jpeg",
    url: file,
  }];

  const tag = (item.people || []).map((name) => ({
    type: "Person",
    name,
  }));

  const as2 = {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Note",
    id: `google-photos:${item.itemId}`,
    url: item.url,
    published: item.dateTaken,
    attributedTo: {
      type: "Person",
      name: item.accountName,
      url: "https://photos.google.com",
    },
    content: item.description || "",
    attachment,
    tag,
    generator: { type: "Application", name: "Google Photos" },
  };

  if (item.location) {
    as2.location = {
      type: "Place",
      name: item.location.name,
      latitude: item.location.latitude,
      longitude: item.location.longitude,
    };
  }

  return as2;
}
```

**Step 4: Run tests to verify they pass**

```bash
node --test tests/plugins/google-photos/as2.test.js
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add plugins/google-photos/as2.js tests/plugins/google-photos/as2.test.js
git commit -m "feat(google-photos): add AS2 converter with tests"
```

---

### Task 3: Downloader

Nearly identical to the Facebook downloader. One media file per item.

**Files:**
- Create: `plugins/google-photos/downloader.js`

**Step 1: Write the implementation**

Create `plugins/google-photos/downloader.js`:

```js
// ABOUTME: Downloads media files from Google Photos URLs to a temp directory.
// ABOUTME: Returns file mappings for the orchestrator to move to the archive.
import { mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

export async function downloadMedia(mediaUrl, tmpDir, itemId, filename, log = console.log) {
  const downloadDir = join(tmpDir, itemId);
  mkdirSync(downloadDir, { recursive: true });

  if (!mediaUrl) {
    log(`  Skipping ${filename}: no URL available`);
    return [];
  }

  const filePath = join(downloadDir, filename);
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    log(`  Failed to download ${mediaUrl}: ${response.status}`);
    return [];
  }
  const fileStream = createWriteStream(filePath);
  await pipeline(response.body, fileStream);
  log(`  Downloaded: ${filename}`);

  return [{ relativePath: filename, tmpPath: filePath }];
}
```

Note: This differs slightly from Instagram/Facebook — each Google Photos item has exactly one media file, so the function takes a single URL and filename instead of an array. The return value is still an array for consistency with the orchestrator interface.

**Step 2: Commit**

```bash
git add plugins/google-photos/downloader.js
git commit -m "feat(google-photos): add media downloader"
```

No unit tests — this is a thin wrapper around `fetch` and `fs`. Tested via integration (manual `postkeeper run`).

---

### Task 4: Progress/Checkpoint Module

Tracks discovered and completed item IDs for resumable runs.

**Files:**
- Create: `plugins/google-photos/progress.js`
- Create: `tests/plugins/google-photos/progress.test.js`

**Step 1: Write the failing tests**

Create `tests/plugins/google-photos/progress.test.js`:

```js
// ABOUTME: Tests for the Google Photos progress/checkpoint module.
// ABOUTME: Validates load, save, markDiscovered, and markCompleted operations.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProgress, saveProgress, markDiscovered, markCompleted, getPending } from "../../../plugins/google-photos/progress.js";

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
    const progress = { discovered: ["id1", "id2"], completed: new Set(["id1"]) };
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
    const progress = { discovered: ["id1", "id2", "id3"], completed: new Set(["id1"]) };
    const pending = getPending(progress);
    assert.deepStrictEqual(pending, ["id2", "id3"]);
  });

  test("getPending returns empty array when all completed", () => {
    const progress = { discovered: ["id1"], completed: new Set(["id1"]) };
    const pending = getPending(progress);
    assert.deepStrictEqual(pending, []);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
node --test tests/plugins/google-photos/progress.test.js
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `plugins/google-photos/progress.js`:

```js
// ABOUTME: Tracks discovered and completed item IDs for resumable Google Photos runs.
// ABOUTME: Persists state to progress.json in the plugin's data directory.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FILENAME = "progress.json";

export function loadProgress(dataDir) {
  try {
    const raw = readFileSync(join(dataDir, FILENAME), "utf-8");
    const data = JSON.parse(raw);
    return {
      discovered: data.discovered || [],
      completed: new Set(data.completed || []),
    };
  } catch {
    return { discovered: [], completed: new Set() };
  }
}

export function saveProgress(dataDir, progress) {
  const data = {
    discovered: progress.discovered,
    completed: [...progress.completed],
  };
  writeFileSync(join(dataDir, FILENAME), JSON.stringify(data, null, 2));
}

export function markDiscovered(progress, ids) {
  const existing = new Set(progress.discovered);
  for (const id of ids) {
    if (!existing.has(id)) {
      progress.discovered.push(id);
      existing.add(id);
    }
  }
}

export function markCompleted(progress, id) {
  progress.completed.add(id);
}

export function getPending(progress) {
  return progress.discovered.filter((id) => !progress.completed.has(id));
}
```

**Step 4: Run tests to verify they pass**

```bash
node --test tests/plugins/google-photos/progress.test.js
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add plugins/google-photos/progress.js tests/plugins/google-photos/progress.test.js
git commit -m "feat(google-photos): add progress checkpoint module with tests"
```

---

### Task 5: Extractor — parseItem

Pure function that normalizes scraped detail page data into the intermediate format consumed by `toAS2`. The input shape will be refined once we inspect real Google Photos pages, but we define the contract now.

**Files:**
- Create: `plugins/google-photos/extractor.js`
- Create: `tests/plugins/google-photos/extractor.test.js`

**Step 1: Write the failing tests**

Create `tests/plugins/google-photos/extractor.test.js`:

```js
// ABOUTME: Tests for Google Photos extractor — parseItem and helper functions.
// ABOUTME: Covers photo, video, location, people, camera EXIF, and edge cases.
import { test, describe } from "node:test";
import assert from "node:assert";
import { parseItem } from "../../../plugins/google-photos/extractor.js";

function makeRawItem(overrides = {}) {
  return {
    itemId: "AF1QipN_abc123",
    dateTaken: "Mar 15, 2024, 2:30:00 PM",
    description: "Sunset at the beach",
    filename: "IMG_1234.jpg",
    mediaType: "image",
    mediaUrl: "https://lh3.googleusercontent.com/photo/abc123=w4080-h3072-no",
    location: { name: "Cannon Beach, Oregon", latitude: 45.8918, longitude: -123.9615 },
    people: ["Alice", "Bob"],
    camera: { model: "Pixel 8 Pro", aperture: "f/1.68", focalLength: "6.9mm", iso: "58" },
    resolution: { width: 4080, height: 3072 },
    fileSize: "4.2 MB",
    ...overrides,
  };
}

describe("Google Photos parseItem", () => {
  test("parses a photo item", () => {
    const item = parseItem(makeRawItem(), "Dylan Richard");
    assert.strictEqual(item.itemId, "AF1QipN_abc123");
    assert.strictEqual(item.url, "https://photos.google.com/photo/AF1QipN_abc123");
    assert.strictEqual(item.description, "Sunset at the beach");
    assert.strictEqual(item.filename, "IMG_1234.jpg");
    assert.strictEqual(item.mediaType, "image");
    assert.strictEqual(item.accountName, "Dylan Richard");
  });

  test("parses dateTaken to ISO string", () => {
    const item = parseItem(makeRawItem(), "Dylan Richard");
    assert.ok(item.dateTaken);
    assert.ok(item.dateTaken.includes("2024"));
  });

  test("passes through location", () => {
    const item = parseItem(makeRawItem(), "Dylan Richard");
    assert.strictEqual(item.location.name, "Cannon Beach, Oregon");
    assert.strictEqual(item.location.latitude, 45.8918);
  });

  test("handles null location", () => {
    const item = parseItem(makeRawItem({ location: null }), "Dylan Richard");
    assert.strictEqual(item.location, null);
  });

  test("passes through people array", () => {
    const item = parseItem(makeRawItem(), "Dylan Richard");
    assert.deepStrictEqual(item.people, ["Alice", "Bob"]);
  });

  test("handles empty people", () => {
    const item = parseItem(makeRawItem({ people: [] }), "Dylan Richard");
    assert.deepStrictEqual(item.people, []);
  });

  test("detects video from filename", () => {
    const item = parseItem(makeRawItem({
      filename: "VID_1234.mp4",
      mediaType: "video",
    }), "Dylan Richard");
    assert.strictEqual(item.mediaType, "video");
  });

  test("handles missing description", () => {
    const item = parseItem(makeRawItem({ description: null }), "Dylan Richard");
    assert.strictEqual(item.description, "");
  });

  test("handles missing dateTaken", () => {
    const item = parseItem(makeRawItem({ dateTaken: null }), "Dylan Richard");
    assert.strictEqual(item.dateTaken, null);
  });

  test("preserves camera and resolution in raw fields", () => {
    const item = parseItem(makeRawItem(), "Dylan Richard");
    assert.strictEqual(item.camera.model, "Pixel 8 Pro");
    assert.strictEqual(item.resolution.width, 4080);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
node --test tests/plugins/google-photos/extractor.test.js
```

Expected: FAIL — module not found.

**Step 3: Write the implementation**

Create `plugins/google-photos/extractor.js`:

```js
// ABOUTME: Extracts and parses Google Photos item data from the web UI.
// ABOUTME: Handles detail page scraping, date parsing, and item normalization.

/**
 * Parse a raw scraped item into the normalized format consumed by toAS2.
 * The raw item comes from scraping the Google Photos detail page DOM.
 */
export function parseItem(raw, accountName) {
  let dateTaken = null;
  if (raw.dateTaken) {
    try {
      dateTaken = new Date(raw.dateTaken).toISOString();
    } catch {
      dateTaken = null;
    }
  }

  return {
    itemId: raw.itemId,
    url: `https://photos.google.com/photo/${raw.itemId}`,
    dateTaken,
    description: raw.description || "",
    filename: raw.filename || "",
    mediaType: raw.mediaType || "image",
    mediaUrl: raw.mediaUrl || "",
    location: raw.location || null,
    people: raw.people || [],
    camera: raw.camera || null,
    resolution: raw.resolution || null,
    fileSize: raw.fileSize || "",
    accountName,
  };
}
```

Note: The browser-dependent functions (`scrollLibrary`, `fetchItemDetails`, `scrapeAccountName`) will be added to this file in Task 7. They require a real browser and are tested manually.

**Step 4: Run tests to verify they pass**

```bash
node --test tests/plugins/google-photos/extractor.test.js
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add plugins/google-photos/extractor.js tests/plugins/google-photos/extractor.test.js
git commit -m "feat(google-photos): add extractor parseItem with tests"
```

---

### Task 6: Plugin index.js — init, status, shutdown

The plugin interface wiring. Browser-dependent so tested manually, but follows the exact same pattern as Instagram/Facebook.

**Files:**
- Create: `plugins/google-photos/index.js`

**Step 1: Write the implementation**

Create `plugins/google-photos/index.js`:

```js
// ABOUTME: Google Photos plugin for postkeeper — archives photos and videos via browser.
// ABOUTME: Uses Playwright to scrape the Google Photos web UI with an authenticated session.
import { chromium } from "playwright";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { parseItem } from "./extractor.js";
import { downloadMedia } from "./downloader.js";
import { toAS2 } from "./as2.js";
import { loadProgress, saveProgress, markDiscovered, markCompleted, getPending } from "./progress.js";

let browserContext = null;

export default {
  name: "google-photos",
  description: "Google Photos archiver",

  async init(config, context) {
    const profileDir = join(context.dataDir, "browser-profile");

    context.log("Opening browser for Google Photos login...");
    context.log(`Browser profile will be saved to: ${profileDir}`);

    const browserCtx = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 900 },
    });

    const page = browserCtx.pages()[0] || await browserCtx.newPage();
    await page.goto("https://photos.google.com/");

    context.log("Log in to your Google account in the browser window.");
    context.log("When you're done, close the browser window.");

    await new Promise((resolve) => {
      browserCtx.on("close", resolve);
    });

    context.log("Session saved.");
  },

  async status(config, context) {
    const profileDir = join(context.dataDir, "browser-profile");
    if (!existsSync(profileDir)) {
      return { ok: false, message: "No browser profile found. Run: postkeeper init google-photos" };
    }

    let browserCtx;
    try {
      browserCtx = await chromium.launchPersistentContext(profileDir, { headless: true });
      const page = await browserCtx.newPage();
      await page.goto("https://photos.google.com/", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);

      // If redirected to accounts.google.com or see a sign-in button, session is expired
      const currentUrl = page.url();
      const loggedIn = currentUrl.includes("photos.google.com") && !currentUrl.includes("accounts.google.com");

      await browserCtx.close();
      return loggedIn
        ? { ok: true, message: "Session valid" }
        : { ok: false, message: "Session expired. Run: postkeeper init google-photos" };
    } catch (err) {
      if (browserCtx) await browserCtx.close().catch(() => {});
      return { ok: false, message: err.message };
    }
  },

  async run(config, context) {
    // Placeholder — Task 8 wires up the full run loop.
    // For now, return empty to satisfy the plugin interface.
    context.log("Google Photos run not yet implemented.");
    return { posts: [] };
  },

  async shutdown() {
    if (browserContext) {
      await browserContext.close();
      browserContext = null;
    }
  },
};
```

**Step 2: Verify plugin loads**

```bash
node -e "import('./plugins/google-photos/index.js').then(m => console.log(m.default.name))"
```

Expected: prints `google-photos`.

**Step 3: Run full test suite to ensure nothing is broken**

```bash
npm test
```

Expected: All existing tests PASS.

**Step 4: Commit**

```bash
git add plugins/google-photos/index.js
git commit -m "feat(google-photos): add plugin index with init, status, shutdown"
```

---

### Task 7: Extractor — Browser Scraping Functions

This task is **exploratory**. We need to actually inspect Google Photos in a browser to understand the DOM structure and internal API response shapes. The functions written here will be refined based on what we find.

**Files:**
- Modify: `plugins/google-photos/extractor.js`

**Step 1: Add scrapeAccountName**

Open Google Photos in a headed browser and inspect the page to find where the account name is displayed (likely in the profile avatar/menu area). Then add:

```js
/* c8 ignore start -- requires Playwright browser page, tested manually */

/**
 * Scrape the logged-in user's account name from the Google Photos page.
 */
export async function scrapeAccountName(page) {
  // Implementation depends on DOM inspection.
  // Likely: click the profile avatar, read the name from the dropdown.
  // Fallback: return "Google Photos User" if we can't find it.
}
```

**Step 2: Add scrollLibrary**

Scroll the main photo grid to discover item IDs. This follows the same scroll-and-wait pattern as Instagram/Facebook.

```js
/**
 * Scroll the Google Photos library grid to discover item IDs.
 * Returns an array of item IDs found during scrolling.
 * Stops when it encounters an ID already in archivedIds, or runs out of content.
 */
export async function scrollLibrary(page, archivedIds, log = () => {}) {
  // Navigate to https://photos.google.com/
  // Scroll, collecting item IDs from either:
  //   a) Intercepted network responses, or
  //   b) DOM links matching photos.google.com/photo/XXXX
  // Stop when we see an already-archived ID or 3 consecutive empty scrolls.
  // Return array of new item IDs.
}
```

**How to discover the DOM pattern:**
1. Run `postkeeper init google-photos` to log in
2. Open a headed browser with the saved profile:
   ```js
   const browserCtx = await chromium.launchPersistentContext(profileDir, { headless: false });
   const page = await browserCtx.newPage();
   await page.goto("https://photos.google.com/");
   ```
3. Open DevTools, inspect the photo grid elements
4. Look for `<a>` tags with `href` containing `/photo/`
5. Check Network tab while scrolling for API responses that contain item data
6. Decide whether to use DOM scraping or response interception

**Step 3: Add fetchItemDetails**

Visit a single item's detail page and scrape all available metadata.

```js
/**
 * Navigate to a photo/video detail page and scrape all metadata.
 * Returns a raw item object for parseItem().
 */
export async function fetchItemDetails(page, itemId, log = () => {}) {
  // Navigate to https://photos.google.com/photo/{itemId}
  // Open the info panel (click the "i" button or equivalent)
  // Scrape: date, filename, resolution, camera EXIF, location, people, description
  // Find the original-quality media URL (intercept download or grab from DOM/network)
  // Return raw item object matching the shape in parseItem tests.
}

/* c8 ignore stop */
```

**How to discover the detail page DOM:**
1. Navigate to a photo detail page in the headed browser
2. Look for the info panel toggle (usually an "i" icon or "Details" button)
3. Inspect the DOM for date, filename, camera info, location, people
4. Check Network tab for the full-res image URL pattern
5. Note: Google uses obfuscated class names — prefer `aria-label`, text content, or structural selectors over class names

**Step 4: Test manually**

```bash
node -e "
import { chromium } from 'playwright';
import { scrapeAccountName, scrollLibrary, fetchItemDetails } from './plugins/google-photos/extractor.js';
(async () => {
  const ctx = await chromium.launchPersistentContext('path/to/browser-profile', { headless: false });
  const page = await ctx.newPage();
  await page.goto('https://photos.google.com/');
  const name = await scrapeAccountName(page);
  console.log('Account name:', name);
  const ids = await scrollLibrary(page, new Set(), console.log);
  console.log('Found IDs:', ids.length);
  if (ids.length > 0) {
    const raw = await fetchItemDetails(page, ids[0], console.log);
    console.log('Raw item:', JSON.stringify(raw, null, 2));
  }
  await ctx.close();
})();
"
```

**Step 5: Commit**

```bash
git add plugins/google-photos/extractor.js
git commit -m "feat(google-photos): add browser scraping functions for library and detail pages"
```

**Important:** The parseItem tests from Task 5 may need updating once we see the real data shapes from Google Photos. Update the `makeRawItem` fixture and parseItem implementation to match reality. Run `node --test tests/plugins/google-photos/extractor.test.js` after any changes.

---

### Task 8: Plugin index.js — Wire Up run()

Connect all the pieces: scrollLibrary → fetchItemDetails → parseItem → downloadMedia → toAS2.

**Files:**
- Modify: `plugins/google-photos/index.js`

**Step 1: Implement the run method**

Replace the placeholder `run()` with the full implementation:

```js
async run(config, context) {
  const profileDir = join(context.dataDir, "browser-profile");
  browserContext = await chromium.launchPersistentContext(profileDir, { headless: true });
  const page = await browserContext.newPage();

  const allPosts = [];

  try {
    // Check if logged in
    await page.goto("https://photos.google.com/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    const currentUrl = page.url();
    if (currentUrl.includes("accounts.google.com")) {
      context.log("Session expired. Run: postkeeper init google-photos");
      return { posts: [] };
    }

    // Scrape account name from the page
    const accountName = await scrapeAccountName(page);
    context.log(`Logged in as: ${accountName}`);

    // Load checkpoint
    const progress = loadProgress(context.dataDir);
    let pending = getPending(progress);

    // If no pending items, scroll to discover new ones
    if (pending.length === 0) {
      context.log("Scrolling library to discover items...");
      const newIds = await scrollLibrary(page, context.archivedIds, context.log);
      markDiscovered(progress, newIds);
      saveProgress(context.dataDir, progress);
      pending = getPending(progress);
      context.log(`Discovered ${pending.length} new item(s)`);
    } else {
      context.log(`Resuming with ${pending.length} pending item(s)`);
    }

    if (pending.length === 0) {
      context.log("No new items.");
      return { posts: [] };
    }

    // Process each pending item
    let consecutiveErrors = 0;

    for (const itemId of pending) {
      context.log(`Processing ${itemId}...`);

      let success = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) {
            const backoff = (2 ** attempt) * 5000 + Math.random() * 5000;
            context.log(`Retry ${attempt}/2 after ${Math.round(backoff / 1000)}s...`);
            await new Promise((r) => setTimeout(r, backoff));
          }

          const rawItem = await fetchItemDetails(page, itemId, context.log);
          const item = parseItem(rawItem, accountName);
          const filename = item.mediaType === "video" ? "1.mp4" : "1.jpg";
          const mediaFiles = await downloadMedia(item.mediaUrl, context.tmpDir, itemId, filename, context.log);

          const as2 = toAS2(item);
          allPosts.push({
            as2,
            raw: rawItem,
            media: mediaFiles,
          });

          markCompleted(progress, itemId);
          saveProgress(context.dataDir, progress);

          success = true;
          consecutiveErrors = 0;
          break;
        } catch (err) {
          context.log(`Attempt ${attempt + 1}/3 failed for ${itemId}: ${err.message}`);
        }
      }

      if (!success) {
        consecutiveErrors++;
        context.log(`Skipping ${itemId} after 3 attempts`);
        if (consecutiveErrors >= 3) {
          context.log("3 consecutive failures — stopping run");
          break;
        }
      }

      // Polite delay between items
      const baseDelay = 1000 + Math.min(allPosts.length * 200, 3000);
      await new Promise((r) => setTimeout(r, baseDelay + Math.random() * 1000));
    }
  } finally {
    await browserContext.close();
    browserContext = null;
  }

  return { posts: allPosts };
},
```

Add the missing imports at the top of index.js:

```js
import { parseItem, scrapeAccountName, scrollLibrary, fetchItemDetails } from "./extractor.js";
import { loadProgress, saveProgress, markDiscovered, markCompleted, getPending } from "./progress.js";
```

**Step 2: Run full test suite**

```bash
npm test
```

Expected: All tests PASS.

**Step 3: Test manually**

```bash
node src/cli.js run google-photos
```

Verify it discovers items, visits detail pages, downloads media, and writes to the archive.

**Step 4: Commit**

```bash
git add plugins/google-photos/index.js
git commit -m "feat(google-photos): wire up run() with scroll, detail, download, checkpoint"
```

---

### Task 9: README and Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`

**Step 1: Add Google Photos section to README**

Add after the Meta Archive Plugin section in `README.md`:

```markdown
## Google Photos Plugin

Archives photos and videos from your Google Photos library.

**Configuration:**

```json
{
  "plugins": {
    "google-photos": {}
  }
}
```

No configuration needed beyond plugin presence. The account name is detected automatically from the logged-in session.

**How it works:**

1. `postkeeper init google-photos` opens a real Chromium browser window. Log in to your Google account, then close the window. The browser session is persisted to the plugin's data directory.
2. `postkeeper run google-photos` launches a headless browser, scrolls through your photo library to discover items, visits each item's detail page for full metadata (date, location, camera EXIF, people tags), downloads the original media, and returns AS2 Notes.
3. Progress is checkpointed to disk. If a run is interrupted, the next run picks up where it left off.
4. Subsequent runs stop scrolling when they reach already-archived items, so only new photos are processed.
```

**Step 2: Update ROADMAP.md**

Mark Google Photos as "In Progress" or "Done" in `docs/ROADMAP.md`.

**Step 3: Commit**

```bash
git add README.md docs/ROADMAP.md
git commit -m "docs: add Google Photos plugin to README and update roadmap"
```

---

### Task 10: Coverage Check and Final Verification

**Step 1: Run full test suite with coverage**

```bash
npx c8 --reporter=text node --test
```

Verify coverage stays at or above 90% lines.

**Step 2: If coverage dropped, add tests**

The browser-dependent code in `extractor.js` is wrapped in `/* c8 ignore start/stop */` so it shouldn't affect coverage. If pure functions need more tests, add them.

**Step 3: Run pre-commit hooks**

```bash
pre-commit run --all-files
```

Expected: All checks pass.

**Step 4: Final commit if needed**

```bash
git add -A
git commit -m "chore(google-photos): coverage and lint fixes"
```
