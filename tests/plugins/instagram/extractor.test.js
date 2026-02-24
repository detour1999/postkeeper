// tests/plugins/instagram/extractor.test.js
import { test, describe } from "node:test";
import assert from "node:assert";
import { parsePost } from "../../../plugins/instagram/extractor.js";

describe("parsePost", () => {
  test("parses a single image post", () => {
    const node = {
      id: "12345",
      pk: "12345",
      code: "ABC123",
      taken_at: 1740000000,
      caption: { text: "Hello world" },
      media_type: 1,
      image_versions2: {
        candidates: [{ url: "https://example.com/img.jpg", width: 1080, height: 1080 }],
      },
      video_versions: null,
      location: { name: "Portland", pk: "99" },
      usertags: { in: [{ user: { username: "friend1" } }] },
      accessibility_caption: "A photo of a sunset",
      like_count: 10,
      comment_count: 3,
      user: { username: "testuser", pk: "111" },
      carousel_media: null,
    };

    const post = parsePost(node);

    assert.strictEqual(post.shortcode, "ABC123");
    assert.strictEqual(post.url, "https://www.instagram.com/p/ABC123/");
    assert.strictEqual(post.id, "12345");
    assert.strictEqual(post.caption, "Hello world");
    assert.strictEqual(post.media_type, "image");
    assert.strictEqual(post.media.length, 1);
    assert.strictEqual(post.media[0].type, "image");
    assert.strictEqual(post.media[0].url, "https://example.com/img.jpg");
    assert.strictEqual(post.location.name, "Portland");
    assert.deepStrictEqual(post.tagged_users, ["friend1"]);
    assert.strictEqual(post.alt_text, "A photo of a sunset");
    assert.strictEqual(post.likes, 10);
    assert.strictEqual(post.comments, 3);
    assert.strictEqual(post.username, "testuser");
  });

  test("parses a carousel post", () => {
    const node = {
      id: "67890",
      code: "XYZ789",
      taken_at: 1740000000,
      caption: { text: "Carousel!" },
      media_type: 8,
      image_versions2: { candidates: [{ url: "https://example.com/cover.jpg" }] },
      video_versions: null,
      location: null,
      usertags: null,
      accessibility_caption: null,
      like_count: 5,
      comment_count: 1,
      user: { username: "testuser" },
      carousel_media_count: 3,
      carousel_media: [
        {
          media_type: 1,
          image_versions2: { candidates: [{ url: "https://example.com/img1.jpg" }] },
          video_versions: null,
        },
        {
          media_type: 1,
          image_versions2: { candidates: [{ url: "https://example.com/img2.jpg" }] },
          video_versions: null,
        },
        {
          media_type: 2,
          image_versions2: { candidates: [{ url: "https://example.com/thumb.jpg" }] },
          video_versions: [{ url: "https://example.com/vid.mp4" }],
        },
      ],
    };

    const post = parsePost(node);

    assert.strictEqual(post.media_type, "carousel");
    assert.strictEqual(post.media.length, 3);
    assert.strictEqual(post.media[0].type, "image");
    assert.strictEqual(post.media[0].url, "https://example.com/img1.jpg");
    assert.strictEqual(post.media[1].type, "image");
    assert.strictEqual(post.media[2].type, "video");
    assert.strictEqual(post.media[2].url, "https://example.com/vid.mp4");
  });

  test("parses a video post", () => {
    const node = {
      id: "11111",
      code: "VID111",
      taken_at: 1740000000,
      caption: null,
      media_type: 2,
      image_versions2: { candidates: [{ url: "https://example.com/thumb.jpg" }] },
      video_versions: [{ url: "https://example.com/video.mp4" }],
      location: null,
      usertags: null,
      accessibility_caption: null,
      like_count: 0,
      comment_count: 0,
      user: { username: "testuser" },
      carousel_media: null,
    };

    const post = parsePost(node);

    assert.strictEqual(post.media_type, "video");
    assert.strictEqual(post.media.length, 1);
    assert.strictEqual(post.media[0].type, "video");
    assert.strictEqual(post.media[0].url, "https://example.com/video.mp4");
    assert.strictEqual(post.caption, "");
  });

  test("handles missing usertags gracefully", () => {
    const node = {
      id: "22222",
      code: "TAG222",
      taken_at: 1740000000,
      caption: { text: "no tags" },
      media_type: 1,
      image_versions2: { candidates: [{ url: "https://example.com/img.jpg" }] },
      user: { username: "testuser" },
      usertags: null,
      location: null,
    };

    const post = parsePost(node);
    assert.deepStrictEqual(post.tagged_users, []);
  });
});
