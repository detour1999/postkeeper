// ABOUTME: Downloads media files from Facebook CDN URLs to a temp directory.
// ABOUTME: Returns file mappings for the orchestrator to move to the archive.
import { mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

export async function downloadMedia(mediaItems, tmpDir, postId, log = console.log) {
  const mediaFiles = [];
  const downloadDir = join(tmpDir, postId);
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
