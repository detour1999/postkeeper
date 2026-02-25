// src/core/orchestrator.js
import { mkdirSync, writeFileSync, renameSync, copyFileSync, unlinkSync, existsSync, readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { validateAS2 } from "./as2.js";
import { getPluginDataDir } from "./paths.js";

export function scanArchive(archiveDir, pluginName) {
  const archivedIds = new Set();
  const latestByAuthor = {};

  const postsDir = join(archiveDir, pluginName, "posts");
  if (!existsSync(postsDir)) return { archivedIds, latestByAuthor };

  for (const author of readdirSync(postsDir, { withFileTypes: true })) {
    if (!author.isDirectory()) continue;
    const authorDir = join(postsDir, author.name);

    for (const file of readdirSync(authorDir)) {
      if (!file.endsWith(".as2.json")) continue;

      try {
        const as2 = JSON.parse(readFileSync(join(authorDir, file), "utf-8"));
        if (as2.id) archivedIds.add(as2.id);
        if (as2.published) {
          const current = latestByAuthor[author.name];
          if (!current || as2.published > current) {
            latestByAuthor[author.name] = as2.published;
          }
        }
      } catch {
        // Skip malformed files
      }
    }
  }

  return { archivedIds, latestByAuthor };
}

function deriveBaseName(as2) {
  const datePrefix = as2.published.slice(0, 10);
  let slug;
  try {
    const url = new URL(as2.id);
    const segments = url.pathname.split("/").filter(Boolean);
    slug = segments[segments.length - 1];
  } catch {
    // For non-URL IDs like "meta-archive:instagram:12345", use last segment
    const parts = as2.id.split(":");
    slug = parts[parts.length - 1];
  }
  // Sanitize: only keep alphanumeric, hyphens, underscores
  slug = slug.replace(/[^a-zA-Z0-9_-]/g, "-");
  return `${datePrefix}-${slug}`;
}

export async function runPlugin(plugin, pluginConfig, archiveDir) {
  const { archivedIds, latestByAuthor } = scanArchive(archiveDir, plugin.name);
  const tmpDir = mkdtempSync(join(tmpdir(), `postkeeper-${plugin.name}-`));

  const context = {
    archivedIds,
    latestByAuthor,
    tmpDir,
    dataDir: getPluginDataDir(plugin.name),
    log: (msg) => console.log(`  [${plugin.name}] ${msg}`),
  };

  const result = await plugin.run(pluginConfig, context);

  for (const post of result.posts) {
    const { as2, raw, media } = post;
    const validation = validateAS2(as2);
    if (!validation.valid) {
      context.log(`Skipping post: invalid AS2 - ${validation.error}`);
      continue;
    }

    const baseName = deriveBaseName(as2);
    const postDir = join(archiveDir, plugin.name, "posts", as2.attributedTo.name);

    // Write AS2 JSON
    const as2Path = join(postDir, `${baseName}.as2.json`);
    mkdirSync(dirname(as2Path), { recursive: true });
    writeFileSync(as2Path, JSON.stringify(as2, null, 2));

    // Write raw JSON
    const rawPath = join(postDir, `${baseName}.raw.json`);
    writeFileSync(rawPath, JSON.stringify(raw, null, 2));

    // Move media files
    if (media && media.length > 0) {
      const mediaDir = join(postDir, baseName);
      mkdirSync(mediaDir, { recursive: true });
      for (const m of media) {
        if (m.tmpPath && existsSync(m.tmpPath)) {
          try {
            renameSync(m.tmpPath, join(mediaDir, m.relativePath));
          } catch {
            copyFileSync(m.tmpPath, join(mediaDir, m.relativePath));
            unlinkSync(m.tmpPath);
          }
        }
      }
    }
  }

  // Clean up temp directory
  rmSync(tmpDir, { recursive: true, force: true });
}
