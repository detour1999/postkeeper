// plugins/meta-archive/index.js
import { existsSync, readFileSync, readdirSync, copyFileSync, mkdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { homedir } from "node:os";
import { parseInstagramJSON, parseFacebookJSON, parseInstagramHTML } from "./parser.js";

function expandPath(p) {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

export default {
  name: "meta-archive",
  description: "Import posts from Meta (Facebook/Instagram) data exports",

  async init(config) {
    const sources = config.sources || [];
    if (sources.length === 0) {
      console.log("No sources configured. Add sources to config.json under plugins.meta-archive.sources");
      return;
    }

    for (const source of sources) {
      const path = expandPath(source.path);
      const exists = existsSync(path);
      console.log(`  ${source.platform}: ${path} - ${exists ? "found" : "NOT FOUND"}`);
      if (exists) {
        const stat = statSync(path);
        console.log(`    Type: ${stat.isDirectory() ? "folder" : "file"} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      }
    }
  },

  async status(config) {
    const sources = config.sources || [];
    if (sources.length === 0) {
      return { ok: false, message: "No sources configured" };
    }
    const missing = sources.filter((s) => !existsSync(expandPath(s.path)));
    if (missing.length > 0) {
      return { ok: false, message: `Missing sources: ${missing.map((s) => s.path).join(", ")}` };
    }
    return { ok: true, message: `${sources.length} source(s) configured` };
  },

  async run(config, context) {
    const sources = config.sources || [];
    const allPosts = [];
    const imported = context.archivedIds;

    for (const source of sources) {
      const sourcePath = expandPath(source.path);

      if (!existsSync(sourcePath)) {
        context.log(`Source not found: ${sourcePath}`);
        continue;
      }

      context.log(`Scanning ${source.platform} from ${source.path}...`);

      let baseDir;
      const isZip = extname(sourcePath).toLowerCase() === ".zip";

      if (isZip) {
        const AdmZip = (await import("adm-zip")).default;
        const zip = new AdmZip(sourcePath);
        baseDir = join(context.tmpDir, basename(sourcePath, ".zip"));
        mkdirSync(baseDir, { recursive: true });
        zip.extractAllTo(baseDir, true);
        context.log("Extracted ZIP archive");
      } else {
        baseDir = sourcePath;
      }

      // Find and parse posts
      let parsedPosts = [];
      const username = config.username || source.username || "unknown";

      if (source.platform === "instagram") {
        const jsonPath = join(baseDir, "your_instagram_activity", "media", "posts_1.json");
        const htmlPath = join(baseDir, "your_instagram_activity", "media", "posts_1.html");

        if (existsSync(jsonPath)) {
          const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
          parsedPosts = parseInstagramJSON(data, username);
          context.log(`Parsed ${parsedPosts.length} post(s) from JSON`);
        } else if (existsSync(htmlPath)) {
          const html = readFileSync(htmlPath, "utf-8");
          parsedPosts = parseInstagramHTML(html, username);
          context.log(`Parsed ${parsedPosts.length} post(s) from HTML`);
        } else {
          context.log("Could not find posts file in export");
          continue;
        }
      } else if (source.platform === "facebook") {
        const postsDir = join(baseDir, "your_facebook_activity", "posts");
        if (existsSync(postsDir)) {
          const files = readdirSync(postsDir).filter((f) => f.startsWith("your_posts") && f.endsWith(".json"));
          if (files.length > 0) {
            const data = JSON.parse(readFileSync(join(postsDir, files[0]), "utf-8"));
            parsedPosts = parseFacebookJSON(data, username);
            context.log(`Parsed ${parsedPosts.length} post(s) from JSON`);
          } else {
            context.log("Could not find posts JSON in Facebook export");
            continue;
          }
        }
      }

      // Filter out already-imported posts
      const newPosts = parsedPosts.filter((p) => !imported.has(p.as2.id));
      if (newPosts.length === 0) {
        context.log("No new posts.");
        continue;
      }
      context.log(`${newPosts.length} new post(s)`);

      // Copy media files to tmpDir
      for (const post of newPosts) {
        const mediaFiles = [];

        for (const [i, uri] of post.mediaUris.entries()) {
          const mediaSourcePath = join(baseDir, uri);
          if (existsSync(mediaSourcePath)) {
            const filename = basename(uri);
            const postSlug = post.as2.id.split(":").pop();
            const downloadDir = join(context.tmpDir, postSlug);
            mkdirSync(downloadDir, { recursive: true });
            const destPath = join(downloadDir, filename);
            copyFileSync(mediaSourcePath, destPath);
            mediaFiles.push({ relativePath: filename, tmpPath: destPath });

            if (post.as2.attachment[i]) {
              post.as2.attachment[i].url = filename;
            }
          }
        }

        allPosts.push({ as2: post.as2, raw: post.raw, media: mediaFiles });
      }
    }

    return { posts: allPosts };
  },
};
