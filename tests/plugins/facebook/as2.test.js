// ABOUTME: Tests for the Facebook AS2 converter.
// ABOUTME: Validates conversion of text, photo, video, shared link, and location posts.
import { test, describe } from "node:test";
import assert from "node:assert";
import { toAS2 } from "../../../plugins/facebook/as2.js";

describe("Facebook toAS2", () => {
  test("converts a text post to AS2", () => {
    const post = {
      postId: "pfbid02abc",
      profileUrl: "https://www.facebook.com/dylanr",
      profileName: "dylanr",
      timestamp: "2024-03-15T14:30:00.000Z",
      content: "Hello world",
      location: null,
      reactions: 42,
      comments: 3,
      media: [],
      sharedLink: null,
    };
    const as2 = toAS2(post);
    assert.strictEqual(as2["@context"], "https://www.w3.org/ns/activitystreams");
    assert.strictEqual(as2.type, "Note");
    assert.strictEqual(as2.id, "https://www.facebook.com/dylanr/posts/pfbid02abc");
    assert.strictEqual(as2.url, "https://www.facebook.com/dylanr/posts/pfbid02abc");
    assert.strictEqual(as2.published, "2024-03-15T14:30:00.000Z");
    assert.strictEqual(as2.attributedTo.name, "dylanr");
    assert.strictEqual(as2.attributedTo.url, "https://www.facebook.com/dylanr");
    assert.strictEqual(as2.content, "Hello world");
    assert.strictEqual(as2.likes.totalItems, 42);
    assert.strictEqual(as2.replies.totalItems, 3);
    assert.strictEqual(as2.generator.name, "Facebook");
    assert.strictEqual(as2.attachment.length, 0);
  });

  test("converts a photo post with media", () => {
    const post = {
      postId: "pfbid02xyz",
      profileUrl: "https://www.facebook.com/dylanr",
      profileName: "dylanr",
      timestamp: "2024-06-01T12:00:00.000Z",
      content: "Photo post",
      location: null,
      reactions: 10,
      comments: 1,
      media: [
        { type: "image", url: "https://cdn.fbcdn.net/img1.jpg", file: "1.jpg" },
        { type: "image", url: "https://cdn.fbcdn.net/img2.jpg", file: "2.jpg" },
      ],
      sharedLink: null,
    };
    const as2 = toAS2(post);
    assert.strictEqual(as2.attachment.length, 2);
    assert.strictEqual(as2.attachment[0].type, "Image");
    assert.strictEqual(as2.attachment[0].mediaType, "image/jpeg");
    assert.strictEqual(as2.attachment[0].url, "1.jpg");
    assert.strictEqual(as2.attachment[1].url, "2.jpg");
  });

  test("converts a video post", () => {
    const post = {
      postId: "pfbid02vid",
      profileUrl: "https://www.facebook.com/dylanr",
      profileName: "dylanr",
      timestamp: "2024-06-01T12:00:00.000Z",
      content: "Video post",
      location: null,
      reactions: 5,
      comments: 0,
      media: [{ type: "video", url: "https://cdn.fbcdn.net/vid.mp4", file: "1.mp4" }],
      sharedLink: null,
    };
    const as2 = toAS2(post);
    assert.strictEqual(as2.attachment[0].type, "Video");
    assert.strictEqual(as2.attachment[0].mediaType, "video/mp4");
  });

  test("includes shared link as attachment", () => {
    const post = {
      postId: "pfbid02link",
      profileUrl: "https://www.facebook.com/dylanr",
      profileName: "dylanr",
      timestamp: "2024-06-01T12:00:00.000Z",
      content: "Check this out",
      location: null,
      reactions: 0,
      comments: 0,
      media: [],
      sharedLink: { url: "https://example.com/article", title: "Cool Article" },
    };
    const as2 = toAS2(post);
    assert.strictEqual(as2.attachment.length, 1);
    assert.strictEqual(as2.attachment[0].type, "Link");
    assert.strictEqual(as2.attachment[0].href, "https://example.com/article");
    assert.strictEqual(as2.attachment[0].name, "Cool Article");
  });

  test("includes location when present", () => {
    const post = {
      postId: "pfbid02loc",
      profileUrl: "https://www.facebook.com/dylanr",
      profileName: "dylanr",
      timestamp: "2024-06-01T12:00:00.000Z",
      content: "At a place",
      location: { name: "Portland, Oregon" },
      reactions: 0,
      comments: 0,
      media: [],
      sharedLink: null,
    };
    const as2 = toAS2(post);
    assert.strictEqual(as2.location.type, "Place");
    assert.strictEqual(as2.location.name, "Portland, Oregon");
  });

  test("omits location when null", () => {
    const post = {
      postId: "pfbid02noloc",
      profileUrl: "https://www.facebook.com/dylanr",
      profileName: "dylanr",
      timestamp: "2024-06-01T12:00:00.000Z",
      content: "No location",
      location: null,
      reactions: 0,
      comments: 0,
      media: [],
      sharedLink: null,
    };
    const as2 = toAS2(post);
    assert.strictEqual(as2.location, undefined);
  });
});
