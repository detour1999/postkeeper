// src/downloader.js
import { mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { join, dirname } from "node:path";
import { pipeline } from "node:stream/promises";

export function buildPostOutputPath(outputDir, post) {
  const datePrefix = post.timestamp.slice(0, 10); // YYYY-MM-DD
  const baseName = `${datePrefix}-${post.shortcode}`;
  const userDir = join(outputDir, "posts", post.username);
  const jsonPath = join(userDir, `${baseName}.json`);
  const mediaDir = join(userDir, baseName);

  return { jsonPath, mediaDir };
}

export function writePostJSON(jsonPath, post) {
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(post, null, 2));
}

export async function downloadMedia(mediaItems, mediaDir) {
  mkdirSync(mediaDir, { recursive: true });

  for (const item of mediaItems) {
    const filePath = join(mediaDir, item.file);
    const response = await fetch(item.url);
    if (!response.ok) {
      console.error(`Failed to download ${item.url}: ${response.status}`);
      continue;
    }
    const fileStream = createWriteStream(filePath);
    await pipeline(response.body, fileStream);
    console.log(`  Downloaded: ${item.file}`);
  }
}
