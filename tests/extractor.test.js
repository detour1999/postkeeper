// tests/extractor.test.js
import { test, describe } from "node:test";
import assert from "node:assert";
import { parsePostFromGraphQL } from "../src/extractor.js";

describe("parsePostFromGraphQL", () => {
  test("parses a single image post", () => {
    const graphqlNode = {
      id: "12345",
      shortcode: "ABC123",
      taken_at_timestamp: 1740000000,
      edge_media_to_caption: { edges: [{ node: { text: "Hello world" } }] },
      display_url: "https://example.com/img.jpg",
      is_video: false,
      __typename: "GraphImage",
      location: { name: "Portland", id: "99" },
      edge_media_to_tagged_user: { edges: [{ node: { user: { username: "friend1" } } }] },
      accessibility_caption: "A photo of a sunset",
      edge_media_preview_like: { count: 10 },
      edge_media_to_comment: { count: 3 },
      owner: { username: "testuser" },
    };

    const post = parsePostFromGraphQL(graphqlNode);

    assert.strictEqual(post.shortcode, "ABC123");
    assert.strictEqual(post.url, "https://www.instagram.com/p/ABC123/");
    assert.strictEqual(post.id, "12345");
    assert.strictEqual(post.caption, "Hello world");
    assert.strictEqual(post.media_type, "image");
    assert.strictEqual(post.media.length, 1);
    assert.strictEqual(post.media[0].type, "image");
    assert.strictEqual(post.location.name, "Portland");
    assert.deepStrictEqual(post.tagged_users, ["friend1"]);
    assert.strictEqual(post.alt_text, "A photo of a sunset");
    assert.strictEqual(post.likes, 10);
    assert.strictEqual(post.comments, 3);
  });

  test("parses a carousel post with sidecar children", () => {
    const graphqlNode = {
      id: "67890",
      shortcode: "XYZ789",
      taken_at_timestamp: 1740000000,
      edge_media_to_caption: { edges: [{ node: { text: "Carousel!" } }] },
      display_url: "https://example.com/img1.jpg",
      __typename: "GraphSidecar",
      is_video: false,
      location: null,
      edge_media_to_tagged_user: { edges: [] },
      accessibility_caption: null,
      edge_media_preview_like: { count: 5 },
      edge_media_to_comment: { count: 1 },
      owner: { username: "testuser" },
      edge_sidecar_to_children: {
        edges: [
          { node: { display_url: "https://example.com/img1.jpg", is_video: false } },
          { node: { display_url: "https://example.com/img2.jpg", is_video: false } },
          { node: { video_url: "https://example.com/vid.mp4", display_url: "https://example.com/thumb.jpg", is_video: true } },
        ],
      },
    };

    const post = parsePostFromGraphQL(graphqlNode);

    assert.strictEqual(post.media_type, "carousel");
    assert.strictEqual(post.media.length, 3);
    assert.strictEqual(post.media[0].type, "image");
    assert.strictEqual(post.media[1].type, "image");
    assert.strictEqual(post.media[2].type, "video");
    assert.strictEqual(post.media[2].url, "https://example.com/vid.mp4");
  });

  test("parses a video post", () => {
    const graphqlNode = {
      id: "11111",
      shortcode: "VID111",
      taken_at_timestamp: 1740000000,
      edge_media_to_caption: { edges: [] },
      display_url: "https://example.com/thumb.jpg",
      video_url: "https://example.com/video.mp4",
      is_video: true,
      __typename: "GraphVideo",
      location: null,
      edge_media_to_tagged_user: { edges: [] },
      accessibility_caption: null,
      edge_media_preview_like: { count: 0 },
      edge_media_to_comment: { count: 0 },
      owner: { username: "testuser" },
    };

    const post = parsePostFromGraphQL(graphqlNode);

    assert.strictEqual(post.media_type, "video");
    assert.strictEqual(post.media.length, 1);
    assert.strictEqual(post.media[0].type, "video");
    assert.strictEqual(post.media[0].url, "https://example.com/video.mp4");
  });
});
