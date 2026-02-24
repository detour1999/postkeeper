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

    console.log("Session saved. You can now run: postkeeper run instagram");
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

  async run(config, context) {
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

            const mediaFiles = await downloadMedia(postData.media, context.tmpDir, shortcode);

            allPosts.push({
              activity: postData,
              raw: rawNode,
              media: mediaFiles,
            });

            state[username] = postData.timestamp;

            await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
          }
        } catch (err) {
          context.log(`Error polling @${username}: ${err.message}`);
          continue;
        }

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
