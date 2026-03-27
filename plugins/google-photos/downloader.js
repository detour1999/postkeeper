// ABOUTME: Downloads media files from Google Photos to a temp directory.
// ABOUTME: Uses Playwright's download event from the Shift+D shortcut for original quality.
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export async function downloadMedia(download, tmpDir, itemId, log = console.log) {
  const downloadDir = join(tmpDir, itemId);
  mkdirSync(downloadDir, { recursive: true });

  const filename = download.suggestedFilename();
  const filePath = join(downloadDir, filename);

  await download.saveAs(filePath);
  log(`  Downloaded: ${filename}`);

  return [{ relativePath: filename, tmpPath: filePath }];
}
