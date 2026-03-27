// ABOUTME: Downloads media files from Google Photos URLs to a temp directory.
// ABOUTME: Returns file mappings for the orchestrator to move to the archive.
import { mkdirSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

export async function downloadMedia(mediaUrl, tmpDir, itemId, filename, log = console.log) {
  const downloadDir = join(tmpDir, itemId);
  mkdirSync(downloadDir, { recursive: true });

  if (!mediaUrl) {
    log(`  Skipping ${filename}: no URL available`);
    return [];
  }

  const filePath = join(downloadDir, filename);
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    log(`  Failed to download ${mediaUrl}: ${response.status}`);
    return [];
  }
  const fileStream = createWriteStream(filePath);
  await pipeline(response.body, fileStream);
  log(`  Downloaded: ${filename}`);

  return [{ relativePath: filename, tmpPath: filePath }];
}
