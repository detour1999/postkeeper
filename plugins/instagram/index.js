import { chromium } from "playwright";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { fetchProfilePosts, fetchPostDetails, parsePost } from "./extractor.js";
import { downloadMedia } from "./downloader.js";
import { toAS2 } from "./as2.js";

let browserContext = null;

export default {
  name: "instagram",
  description: "Instagram profile archiver",

  async init(config, context) {
    const profileDir = join(context.dataDir, "browser-profile");

    console.log("Opening browser for Instagram login...");
    console.log(`Browser profile will be saved to: ${profileDir}`);

    const browserCtx = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 900 },
    });

    const page = browserCtx.pages()[0] || await browserCtx.newPage();
    await page.goto("https://www.instagram.com/");

    console.log("Log in to Instagram in the browser window.");
    console.log("When you're done, close the browser window.");

    await new Promise((resolve) => {
      browserCtx.on("close", resolve);
    });

    console.log("Session saved.");

    if (context.prompt && context.saveConfig) {
      const profiles = config.profiles ? [...config.profiles] : [];
      while (true) {
        const input = await context.prompt("Enter an Instagram username to track (or press Enter to finish):");
        if (!input) break;
        const username = input.startsWith("@") ? input.slice(1) : input;
        if (!profiles.includes(username)) {
          profiles.push(username);
        }
      }
      if (profiles.length > 0) {
        context.saveConfig({ profiles });
      }
    } else {
      console.log("Add profiles to config.json, then run: postkeeper run instagram");
    }
  },

  async status(config, context) {
    const profileDir = join(context.dataDir, "browser-profile");
    if (!existsSync(profileDir)) {
      return { ok: false, message: "No browser profile found. Run: postkeeper init instagram" };
    }

    let browserCtx;
    try {
      browserCtx = await chromium.launchPersistentContext(profileDir, { headless: true });
      const page = await browserCtx.newPage();
      await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3000);

      const loggedIn = await page.evaluate(() => {
        return !document.querySelector('input[name="username"]');
      });

      await browserCtx.close();
      return loggedIn
        ? { ok: true, message: "Session valid" }
        : { ok: false, message: "Session expired. Run: postkeeper init instagram" };
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
      for (const username of profiles) {
        context.log(`Checking @${username}...`);

        try {
          const lastSeen = context.latestByAuthor[username] || null;
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

          let consecutiveErrors = 0;

          for (const node of newPosts) {
            const shortcode = node.code;
            context.log(`Processing post ${shortcode}...`);

            let success = false;
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                if (attempt > 0) {
                  const backoff = (2 ** attempt) * 5000 + Math.random() * 5000;
                  context.log(`Retry ${attempt}/2 after ${Math.round(backoff / 1000)}s...`);
                  await new Promise((r) => setTimeout(r, backoff));
                }

                const fullNode = await fetchPostDetails(page, shortcode);
                const rawNode = fullNode || node;
                const postData = parsePost(rawNode);

                const mediaFiles = await downloadMedia(postData.media, context.tmpDir, shortcode, context.log);

                const as2 = toAS2(postData);
                allPosts.push({
                  as2,
                  raw: rawNode,
                  media: mediaFiles,
                });

                success = true;
                consecutiveErrors = 0;
                break;
              } catch (err) {
                context.log(`Attempt ${attempt + 1}/3 failed for ${shortcode}: ${err.message}`);
              }
            }

            if (!success) {
              consecutiveErrors++;
              context.log(`Skipping post ${shortcode} after 3 attempts`);
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
          context.log(`Error polling @${username}: ${err.message}`);
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
