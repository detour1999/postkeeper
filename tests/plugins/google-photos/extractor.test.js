// ABOUTME: Tests for Google Photos extractor — parseItem and helper functions.
// ABOUTME: Covers photo, video, location, people, camera EXIF, and edge cases.
import { test, describe } from "node:test";
import assert from "node:assert";
import { parseItem } from "../../../plugins/google-photos/extractor.js";

function makeRawItem(overrides = {}) {
  return {
    itemId: "AF1QipN_abc123",
    dateTaken: "Mar 15, 2024, 2:30:00 PM",
    description: "Sunset at the beach",
    filename: "IMG_1234.jpg",
    mediaType: "image",
    mediaUrl: "https://lh3.googleusercontent.com/photo/abc123=w4080-h3072-no",
    location: { name: "Cannon Beach, Oregon", latitude: 45.8918, longitude: -123.9615 },
    people: ["Alice", "Bob"],
    camera: { model: "Pixel 8 Pro", aperture: "f/1.68", focalLength: "6.9mm", iso: "58" },
    resolution: { width: 4080, height: 3072 },
    fileSize: "4.2 MB",
    ...overrides,
  };
}

describe("Google Photos parseItem", () => {
  test("parses a photo item", () => {
    const item = parseItem(makeRawItem(), "Dylan Richard");
    assert.strictEqual(item.itemId, "AF1QipN_abc123");
    assert.strictEqual(item.url, "https://photos.google.com/photo/AF1QipN_abc123");
    assert.strictEqual(item.description, "Sunset at the beach");
    assert.strictEqual(item.filename, "IMG_1234.jpg");
    assert.strictEqual(item.mediaType, "image");
    assert.strictEqual(item.accountName, "Dylan Richard");
  });

  test("parses dateTaken with year to ISO string", () => {
    const item = parseItem(makeRawItem(), "Dylan Richard");
    assert.ok(item.dateTaken);
    assert.ok(item.dateTaken.includes("2024"));
  });

  test("parses dateTaken without year by inserting current year", () => {
    const item = parseItem(makeRawItem({ dateTaken: "Mar 27, 9:49 AM" }), "Dylan Richard");
    assert.ok(item.dateTaken);
    const year = new Date().getFullYear().toString();
    assert.ok(item.dateTaken.includes(year));
  });

  test("passes through location", () => {
    const item = parseItem(makeRawItem(), "Dylan Richard");
    assert.strictEqual(item.location.name, "Cannon Beach, Oregon");
    assert.strictEqual(item.location.latitude, 45.8918);
  });

  test("handles null location", () => {
    const item = parseItem(makeRawItem({ location: null }), "Dylan Richard");
    assert.strictEqual(item.location, null);
  });

  test("passes through people array", () => {
    const item = parseItem(makeRawItem(), "Dylan Richard");
    assert.deepStrictEqual(item.people, ["Alice", "Bob"]);
  });

  test("handles empty people", () => {
    const item = parseItem(makeRawItem({ people: [] }), "Dylan Richard");
    assert.deepStrictEqual(item.people, []);
  });

  test("detects video from mediaType", () => {
    const item = parseItem(makeRawItem({
      filename: "VID_1234.mp4",
      mediaType: "video",
    }), "Dylan Richard");
    assert.strictEqual(item.mediaType, "video");
  });

  test("handles missing description", () => {
    const item = parseItem(makeRawItem({ description: null }), "Dylan Richard");
    assert.strictEqual(item.description, "");
  });

  test("handles missing dateTaken", () => {
    const item = parseItem(makeRawItem({ dateTaken: null }), "Dylan Richard");
    assert.strictEqual(item.dateTaken, null);
  });

  test("preserves camera and resolution in raw fields", () => {
    const item = parseItem(makeRawItem(), "Dylan Richard");
    assert.strictEqual(item.camera.model, "Pixel 8 Pro");
    assert.strictEqual(item.resolution.width, 4080);
  });
});
