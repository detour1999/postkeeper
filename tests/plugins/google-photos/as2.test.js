// ABOUTME: Tests for the Google Photos AS2 converter.
// ABOUTME: Validates conversion of photo/video items to ActivityStreams 2.0 format.
import { test, describe } from "node:test";
import assert from "node:assert";
import { toAS2 } from "../../../plugins/google-photos/as2.js";

function makeItem(overrides = {}) {
  return {
    itemId: "AF1QipN_abc123",
    url: "https://photos.google.com/photo/AF1QipN_abc123",
    dateTaken: "2024-03-15T14:30:00.000Z",
    description: "Sunset at the beach",
    filename: "IMG_1234.jpg",
    mediaType: "image",
    location: { name: "Cannon Beach, Oregon", latitude: 45.8918, longitude: -123.9615 },
    people: ["Alice", "Bob"],
    camera: { model: "Pixel 8 Pro", aperture: "f/1.68", focalLength: "6.9mm", iso: "58" },
    resolution: { width: 4080, height: 3072 },
    fileSize: "4.2 MB",
    accountName: "Dylan Richard",
    ...overrides,
  };
}

describe("Google Photos toAS2", () => {
  test("converts a photo item to AS2 Note", () => {
    const as2 = toAS2(makeItem());
    assert.strictEqual(as2["@context"], "https://www.w3.org/ns/activitystreams");
    assert.strictEqual(as2.type, "Note");
    assert.strictEqual(as2.id, "google-photos:AF1QipN_abc123");
    assert.strictEqual(as2.url, "https://photos.google.com/photo/AF1QipN_abc123");
    assert.strictEqual(as2.published, "2024-03-15T14:30:00.000Z");
    assert.strictEqual(as2.content, "Sunset at the beach");
    assert.strictEqual(as2.attributedTo.name, "Dylan Richard");
    assert.strictEqual(as2.attributedTo.url, "https://photos.google.com");
    assert.strictEqual(as2.generator.name, "Google Photos");
  });

  test("includes photo as Image attachment", () => {
    const as2 = toAS2(makeItem());
    assert.strictEqual(as2.attachment.length, 1);
    assert.strictEqual(as2.attachment[0].type, "Image");
    assert.strictEqual(as2.attachment[0].mediaType, "image/jpeg");
    assert.strictEqual(as2.attachment[0].url, "1.jpg");
  });

  test("includes video as Video attachment", () => {
    const as2 = toAS2(makeItem({ mediaType: "video", filename: "VID_1234.mp4" }));
    assert.strictEqual(as2.attachment[0].type, "Video");
    assert.strictEqual(as2.attachment[0].mediaType, "video/mp4");
    assert.strictEqual(as2.attachment[0].url, "1.mp4");
  });

  test("includes location with coordinates", () => {
    const as2 = toAS2(makeItem());
    assert.strictEqual(as2.location.type, "Place");
    assert.strictEqual(as2.location.name, "Cannon Beach, Oregon");
    assert.strictEqual(as2.location.latitude, 45.8918);
    assert.strictEqual(as2.location.longitude, -123.9615);
  });

  test("omits location when null", () => {
    const as2 = toAS2(makeItem({ location: null }));
    assert.strictEqual(as2.location, undefined);
  });

  test("includes people as Person tags", () => {
    const as2 = toAS2(makeItem());
    assert.strictEqual(as2.tag.length, 2);
    assert.strictEqual(as2.tag[0].type, "Person");
    assert.strictEqual(as2.tag[0].name, "Alice");
    assert.strictEqual(as2.tag[1].name, "Bob");
  });

  test("handles no people", () => {
    const as2 = toAS2(makeItem({ people: [] }));
    assert.strictEqual(as2.tag.length, 0);
  });

  test("handles empty description", () => {
    const as2 = toAS2(makeItem({ description: "" }));
    assert.strictEqual(as2.content, "");
  });

  test("handles null dateTaken", () => {
    const as2 = toAS2(makeItem({ dateTaken: null }));
    assert.strictEqual(as2.published, null);
  });
});
