// plugins/instagram/downloader.js
import { mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

export async function downloadMedia(mediaItems, tmpDir, shortcode, log = console.log) {
  const mediaFiles = [];
  const downloadDir = join(tmpDir, shortcode);
  mkdirSync(downloadDir, { recursive: true });

  for (const item of mediaItems) {
    const filePath = join(downloadDir, item.file);
    const response = await fetch(item.url);
    if (!response.ok) {
      log(`  Failed to download ${item.url}: ${response.status}`);
      continue;
    }
    const fileStream = createWriteStream(filePath);
    await pipeline(response.body, fileStream);
    log(`  Downloaded: ${item.file}`);

    mediaFiles.push({
      relativePath: item.file,
      tmpPath: filePath,
    });
  }

  return mediaFiles;
}
