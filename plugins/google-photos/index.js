// ABOUTME: Google Photos plugin for postkeeper — archives photos and videos via browser.
// ABOUTME: Uses Playwright to scrape the Google Photos web UI with an authenticated session.
import { chromium } from "playwright";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { parseItem, scrapeAccountName, scrollLibrary, fetchItemDetails, downloadOriginal } from "./extractor.js";
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
      channel: "chrome",
      ignoreDefaultArgs: ["--enable-automation"],
      args: ["--disable-blink-features=AutomationControlled"],
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
      browserCtx = await chromium.launchPersistentContext(profileDir, {
        headless: true,
        channel: "chrome",
        ignoreDefaultArgs: ["--enable-automation"],
        args: ["--disable-blink-features=AutomationControlled"],
      });
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
    const profileDir = join(context.dataDir, "browser-profile");
    browserContext = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      channel: "chrome",
      ignoreDefaultArgs: ["--enable-automation"],
      args: ["--disable-blink-features=AutomationControlled"],
      acceptDownloads: true,
      viewport: { width: 1280, height: 900 },
    });
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

      // Scrape account name
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

            // Download original via Shift+D
            const { download } = await downloadOriginal(page, itemId);
            const mediaFiles = await downloadMedia(download, context.tmpDir, itemId, context.log);

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

  async shutdown() {
    if (browserContext) {
      await browserContext.close();
      browserContext = null;
    }
  },
};
