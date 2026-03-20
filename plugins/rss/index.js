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

  async init(config, context) {
    const log = context?.log || console.log;
    const feeds = config.feeds ? [...config.feeds] : [];

    if (context?.prompt) {
      while (true) {
        const url = await context.prompt("Enter feed URL (or press Enter to finish):");
        if (!url) break;
        const name = await context.prompt("Feed name (optional, press Enter to skip):");
        const entry = { url };
        if (name) entry.name = name;
        feeds.push(entry);
      }

      if (context.saveConfig && feeds.length > 0) {
        context.saveConfig({ feeds });
      }
    }

    if (feeds.length === 0) {
      log("No feeds configured. Add feeds to config.json under plugins.rss.feeds");
      return;
    }

    log(`Configured ${feeds.length} feed(s):`);
    for (const feed of feeds) {
      log(`  ${feed.name || feed.url}`);
      try {
        const response = await fetch(feed.url, { method: "HEAD" });
        log(`    ${response.ok ? "OK" : `HTTP ${response.status}`}`);
      } catch (err) {
        log(`    Error: ${err.message}`);
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

        // Filter by archivedIds (exact dedup) and fall back to latestByAuthor (time-based)
        const newArticles = articles.filter((a) => {
          if (context.archivedIds.has(a.id)) return false;
          const lastSeen = context.latestByAuthor[feedName] || null;
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

      } catch (err) {
        context.log(`Error fetching ${feedName}: ${err.message}`);
      }
    }

    return { posts: allPosts };
  },
};
