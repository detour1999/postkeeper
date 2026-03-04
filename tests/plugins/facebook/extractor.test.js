// ABOUTME: Tests for Facebook post parser that converts GraphQL nodes to clean post format.
// ABOUTME: Covers text, photo, video, shared link, check-in, and edge cases.
import { test, describe } from "node:test";
import assert from "node:assert";
import { parsePost } from "../../../plugins/facebook/extractor.js";

describe("Facebook parsePost", () => {
  test("parses a text-only post", () => {
    const node = {
      post_id: "pfbid02abc",
      creation_time: 1710510600,
      message: { text: "Hello world" },
      feedback: { reaction_count: { count: 42 }, comment_count: { total_count: 3 } },
      attached_media: [],
      attached_link: null,
      place: null,
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.strictEqual(post.postId, "pfbid02abc");
    assert.strictEqual(post.content, "Hello world");
    assert.strictEqual(post.timestamp, "2024-03-15T13:50:00.000Z");
    assert.strictEqual(post.reactions, 42);
    assert.strictEqual(post.comments, 3);
    assert.strictEqual(post.media.length, 0);
    assert.strictEqual(post.sharedLink, null);
    assert.strictEqual(post.location, null);
  });

  test("parses a photo post", () => {
    const node = {
      post_id: "pfbid02photo",
      creation_time: 1710510600,
      message: { text: "Photo!" },
      feedback: { reaction_count: { count: 5 }, comment_count: { total_count: 0 } },
      attached_media: [
        { media: { image: { uri: "https://cdn.fbcdn.net/img1.jpg" }, __typename: "Photo" } },
        { media: { image: { uri: "https://cdn.fbcdn.net/img2.jpg" }, __typename: "Photo" } },
      ],
      attached_link: null,
      place: null,
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.strictEqual(post.media.length, 2);
    assert.strictEqual(post.media[0].type, "image");
    assert.strictEqual(post.media[0].url, "https://cdn.fbcdn.net/img1.jpg");
    assert.strictEqual(post.media[0].file, "1.jpg");
    assert.strictEqual(post.media[1].file, "2.jpg");
  });

  test("parses a video post", () => {
    const node = {
      post_id: "pfbid02vid",
      creation_time: 1710510600,
      message: { text: "Video!" },
      feedback: { reaction_count: { count: 0 }, comment_count: { total_count: 0 } },
      attached_media: [
        { media: { playable_url: "https://cdn.fbcdn.net/vid.mp4", __typename: "Video" } },
      ],
      attached_link: null,
      place: null,
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.strictEqual(post.media.length, 1);
    assert.strictEqual(post.media[0].type, "video");
    assert.strictEqual(post.media[0].url, "https://cdn.fbcdn.net/vid.mp4");
    assert.strictEqual(post.media[0].file, "1.mp4");
  });

  test("parses a shared link", () => {
    const node = {
      post_id: "pfbid02link",
      creation_time: 1710510600,
      message: { text: "Check this out" },
      feedback: { reaction_count: { count: 0 }, comment_count: { total_count: 0 } },
      attached_media: [],
      attached_link: { url: "https://example.com/article", title: "Cool Article" },
      place: null,
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.deepStrictEqual(post.sharedLink, { url: "https://example.com/article", title: "Cool Article" });
  });

  test("parses a check-in post", () => {
    const node = {
      post_id: "pfbid02loc",
      creation_time: 1710510600,
      message: { text: "At a place" },
      feedback: { reaction_count: { count: 0 }, comment_count: { total_count: 0 } },
      attached_media: [],
      attached_link: null,
      place: { name: "Portland, Oregon" },
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.deepStrictEqual(post.location, { name: "Portland, Oregon" });
  });

  test("handles missing message gracefully", () => {
    const node = {
      post_id: "pfbid02nomsg",
      creation_time: 1710510600,
      message: null,
      feedback: { reaction_count: { count: 0 }, comment_count: { total_count: 0 } },
      attached_media: [],
      attached_link: null,
      place: null,
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.strictEqual(post.content, "");
  });

  test("handles missing feedback gracefully", () => {
    const node = {
      post_id: "pfbid02nofb",
      creation_time: 1710510600,
      message: { text: "Hi" },
      feedback: null,
      attached_media: [],
      attached_link: null,
      place: null,
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.strictEqual(post.reactions, 0);
    assert.strictEqual(post.comments, 0);
  });
});
