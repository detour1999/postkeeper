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
      browserCtx = await chromium.launchPersistentContext(profileDir, { headless: true, channel: "chrome" });
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
