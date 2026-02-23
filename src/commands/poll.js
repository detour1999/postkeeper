// src/commands/poll.js
import { chromium } from "playwright";
import { resolve, join } from "node:path";
import { loadConfig } from "../config.js";
import { loadState, saveState, isNewPost } from "../state.js";
import {
  fetchProfilePosts,
  fetchPostDetails,
  parsePost,
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

      try {
        const postNodes = await fetchProfilePosts(page, username);
        console.log(`  Found ${postNodes.length} recent post(s)`);

        // Filter to new posts and sort oldest-first so we process in order
        const newPosts = postNodes
          .filter((node) => {
            const ts = new Date(node.taken_at * 1000).toISOString();
            return isNewPost(state, username, ts);
          })
          .sort((a, b) => a.taken_at - b.taken_at);

        if (newPosts.length === 0) {
          console.log("  No new posts.");
          continue;
        }

        console.log(`  ${newPosts.length} new post(s) to download`);

        for (const node of newPosts) {
          const shortcode = node.code;
          console.log(`  Processing post ${shortcode}...`);

          // Fetch full details (needed for carousel children with all media)
          const fullNode = await fetchPostDetails(page, shortcode);
          const postData = parsePost(fullNode || node);

          const paths = buildPostOutputPath(outputDir, postData);
          writePostJSON(paths.jsonPath, postData);
          await downloadMedia(postData.media, paths.mediaDir);

          // Update state to this post's timestamp
          state[username] = postData.timestamp;
          saveState(statePath, state);

          console.log(`  Saved: ${paths.jsonPath}`);
        }
      } catch (err) {
        console.error(`  Error polling @${username}: ${err.message}`);
        continue;
      }
    }
  } finally {
    await context.close();
  }

  console.log("\nDone.");
}
