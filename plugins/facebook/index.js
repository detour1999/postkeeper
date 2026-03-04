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
