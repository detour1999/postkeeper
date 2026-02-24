// tests/plugins/instagram/downloader.test.js
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { downloadMedia } from "../../../plugins/instagram/downloader.js";

describe("downloadMedia", () => {
  let server;
  let baseUrl;
  let tmpDir;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "downloader-test-"));

    server = createServer((req, res) => {
      if (req.url === "/image1.jpg") {
        res.writeHead(200, { "Content-Type": "image/jpeg" });
        res.end("fake-image-data-1");
      } else if (req.url === "/image2.jpg") {
        res.writeHead(200, { "Content-Type": "image/jpeg" });
        res.end("fake-image-data-2");
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("downloads media items to tmpDir and returns file mappings", async () => {
    const mediaItems = [
      { file: "image1.jpg", url: `${baseUrl}/image1.jpg` },
      { file: "image2.jpg", url: `${baseUrl}/image2.jpg` },
    ];

    const results = await downloadMedia(mediaItems, tmpDir, "ABC123");

    assert.strictEqual(results.length, 2);

    assert.strictEqual(results[0].relativePath, "image1.jpg");
    assert.strictEqual(results[0].tmpPath, join(tmpDir, "ABC123", "image1.jpg"));
    assert.strictEqual(readFileSync(results[0].tmpPath, "utf8"), "fake-image-data-1");

    assert.strictEqual(results[1].relativePath, "image2.jpg");
    assert.strictEqual(results[1].tmpPath, join(tmpDir, "ABC123", "image2.jpg"));
    assert.strictEqual(readFileSync(results[1].tmpPath, "utf8"), "fake-image-data-2");
  });

  test("skips items that fail to download", async () => {
    const mediaItems = [
      { file: "missing.jpg", url: `${baseUrl}/missing.jpg` },
      { file: "image1.jpg", url: `${baseUrl}/image1.jpg` },
    ];

    const results = await downloadMedia(mediaItems, tmpDir, "DEF456");

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].relativePath, "image1.jpg");
    assert.strictEqual(readFileSync(results[0].tmpPath, "utf8"), "fake-image-data-1");
  });

  test("creates shortcode subdirectory in tmpDir", async () => {
    const mediaItems = [
      { file: "image1.jpg", url: `${baseUrl}/image1.jpg` },
    ];

    await downloadMedia(mediaItems, tmpDir, "GHI789");

    assert.ok(existsSync(join(tmpDir, "GHI789")));
  });
});
