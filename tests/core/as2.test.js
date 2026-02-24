// tests/core/as2.test.js
import { test, describe } from "node:test";
import assert from "node:assert";
import { toAS2 } from "../../src/core/as2.js";

describe("toAS2", () => {
  test("converts an image post to AS2", () => {
    const post = {
      shortcode: "ABC123",
      url: "https://www.instagram.com/p/ABC123/",
      id: "12345",
      username: "testuser",
      timestamp: "2024-03-15T14:30:00.000Z",
      caption: "Hello world",
      location: { name: "Portland", id: "99" },
      tagged_users: ["friend1"],
      alt_text: "A sunset photo",
      likes: 42,
      comments: 3,
      media_type: "image",
      media: [{ type: "image", url: "https://cdn.example.com/img.jpg", file: "1.jpg" }],
    };

    const as2 = toAS2(post, "instagram");

    assert.strictEqual(as2["@context"], "https://www.w3.org/ns/activitystreams");
    assert.strictEqual(as2.type, "Note");
    assert.strictEqual(as2.id, "https://www.instagram.com/p/ABC123/");
    assert.strictEqual(as2.published, "2024-03-15T14:30:00.000Z");
    assert.strictEqual(as2.content, "Hello world");
    assert.strictEqual(as2.attributedTo.name, "testuser");
    assert.strictEqual(as2.attributedTo.url, "https://www.instagram.com/testuser/");
    assert.strictEqual(as2.attachment.length, 1);
    assert.strictEqual(as2.attachment[0].type, "Image");
    assert.strictEqual(as2.attachment[0].url, "1.jpg");
    assert.strictEqual(as2.attachment[0].name, "A sunset photo");
    assert.strictEqual(as2.attachment[0].mediaType, "image/jpeg");
    assert.strictEqual(as2.location.type, "Place");
    assert.strictEqual(as2.location.name, "Portland");
    assert.strictEqual(as2.tag.length, 1);
    assert.strictEqual(as2.tag[0].type, "Mention");
    assert.strictEqual(as2.tag[0].name, "@friend1");
    assert.strictEqual(as2.likes.totalItems, 42);
    assert.strictEqual(as2.replies.totalItems, 3);
    assert.strictEqual(as2.generator.name, "Instagram");
  });

  test("converts a carousel post with multiple attachments", () => {
    const post = {
      shortcode: "XYZ789",
      url: "https://www.instagram.com/p/XYZ789/",
      id: "67890",
      username: "testuser",
      timestamp: "2024-03-15T14:30:00.000Z",
      caption: "Carousel!",
      location: null,
      tagged_users: [],
      alt_text: null,
      likes: 5,
      comments: 1,
      media_type: "carousel",
      media: [
        { type: "image", url: "https://cdn.example.com/1.jpg", file: "1.jpg" },
        { type: "image", url: "https://cdn.example.com/2.jpg", file: "2.jpg" },
        { type: "video", url: "https://cdn.example.com/3.mp4", file: "3.mp4" },
      ],
    };

    const as2 = toAS2(post, "instagram");

    assert.strictEqual(as2.attachment.length, 3);
    assert.strictEqual(as2.attachment[0].type, "Image");
    assert.strictEqual(as2.attachment[0].url, "1.jpg");
    assert.strictEqual(as2.attachment[2].type, "Video");
    assert.strictEqual(as2.attachment[2].url, "3.mp4");
    assert.strictEqual(as2.attachment[2].mediaType, "video/mp4");
    assert.strictEqual(as2.location, undefined);
    assert.deepStrictEqual(as2.tag, []);
  });

  test("converts a video post", () => {
    const post = {
      shortcode: "VID111",
      url: "https://www.instagram.com/p/VID111/",
      id: "11111",
      username: "testuser",
      timestamp: "2024-03-15T14:30:00.000Z",
      caption: "",
      location: null,
      tagged_users: [],
      alt_text: null,
      likes: 0,
      comments: 0,
      media_type: "video",
      media: [{ type: "video", url: "https://cdn.example.com/video.mp4", file: "1.mp4" }],
    };

    const as2 = toAS2(post, "instagram");

    assert.strictEqual(as2.attachment.length, 1);
    assert.strictEqual(as2.attachment[0].type, "Video");
    assert.strictEqual(as2.attachment[0].mediaType, "video/mp4");
  });

  test("uses generic attributedTo when platform is unknown", () => {
    const post = {
      shortcode: "ABC",
      url: "https://example.com/post/ABC",
      id: "1",
      username: "someone",
      timestamp: "2024-01-01T00:00:00.000Z",
      caption: "test",
      location: null,
      tagged_users: [],
      alt_text: null,
      likes: 0,
      comments: 0,
      media_type: "image",
      media: [{ type: "image", url: "https://example.com/img.jpg", file: "1.jpg" }],
    };

    const as2 = toAS2(post, "somefeed");

    assert.strictEqual(as2.attributedTo.name, "someone");
    assert.strictEqual(as2.attributedTo.url, undefined);
    assert.strictEqual(as2.generator.name, "Somefeed");
  });
});
