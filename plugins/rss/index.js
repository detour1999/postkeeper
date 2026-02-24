// plugins/rss/index.js
import { mkdirSync, createWriteStream } from "node:fs";
import { join, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { parseFeed } from "./parser.js";

async function downloadEnclosure(url, tmpDir, index, log) {
  const ext = extname(new URL(url).pathname) || ".bin";
  const filename = `${index + 1}${ext}`;
  const filePath = join(tmpDir, filename);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      log(`Failed to download enclosure ${url}: ${response.status}`);
      return null;
    }
    const fileStream = createWriteStream(filePath);
    await pipeline(response.body, fileStream);
    log(`Downloaded: ${filename}`);
    return { relativePath: filename, tmpPath: filePath };
  } catch (err) {
    log(`Failed to download enclosure ${url}: ${err.message}`);
    return null;
  }
}

export default {
  name: "rss",
  description: "RSS/Atom feed archiver",

  async init(config) {
    const feeds = config.feeds || [];
    if (feeds.length === 0) {
      console.log("No feeds configured. Add feeds to config.json under plugins.rss.feeds");
      return;
    }

    console.log(`Configured ${feeds.length} feed(s):`);
    for (const feed of feeds) {
      console.log(`  ${feed.name || feed.url}`);
      try {
        const response = await fetch(feed.url, { method: "HEAD" });
        console.log(`    ${response.ok ? "OK" : `HTTP ${response.status}`}`);
      } catch (err) {
        console.log(`    Error: ${err.message}`);
      }
    }
  },

  async status(config) {
    const feeds = config.feeds || [];
    if (feeds.length === 0) {
      return { ok: false, message: "No feeds configured" };
    }
    return { ok: true, message: `${feeds.length} feed(s) configured` };
  },

  async run(config, context) {
    const feeds = config.feeds || [];
    const allPosts = [];
    const state = { ...context.state };

    for (const feed of feeds) {
      const feedName = feed.name || feed.url;
      context.log(`Fetching ${feedName}...`);

      try {
        const response = await fetch(feed.url);
        if (!response.ok) {
          context.log(`Failed to fetch ${feedName}: HTTP ${response.status}`);
          continue;
        }

        const xml = await response.text();
        const articles = parseFeed(xml, feedName);
        context.log(`Found ${articles.length} article(s)`);

        const lastSeen = state[feed.url] || null;
        const newArticles = articles.filter((a) => {
          if (!lastSeen || !a.published) return true;
          return new Date(a.published) > new Date(lastSeen);
        });

        if (newArticles.length === 0) {
          context.log("No new articles.");
          continue;
        }

        context.log(`${newArticles.length} new article(s)`);

        for (const as2 of newArticles) {
          // Download enclosures
          const mediaFiles = [];
          for (let i = 0; i < as2.attachment.length; i++) {
            const att = as2.attachment[i];
            const slug = as2.id ? new URL(as2.id).pathname.split("/").filter(Boolean).pop() : `${i}`;
            const downloadDir = join(context.tmpDir, slug);
            mkdirSync(downloadDir, { recursive: true });

            const result = await downloadEnclosure(att.url, downloadDir, i, context.log);
            if (result) {
              mediaFiles.push(result);
              // Update attachment URL to local path
              att.url = result.relativePath;
            }
          }

          allPosts.push({ as2, raw: { feed_url: feed.url, feed_name: feedName }, media: mediaFiles });
        }

        // Update state with newest article timestamp
        const newest = newArticles
          .filter((a) => a.published)
          .sort((a, b) => new Date(b.published) - new Date(a.published))[0];
        if (newest) {
          state[feed.url] = newest.published;
        }
      } catch (err) {
        context.log(`Error fetching ${feedName}: ${err.message}`);
      }
    }

    return { posts: allPosts, state };
  },
};
