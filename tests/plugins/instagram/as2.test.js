import { test, describe } from "node:test";
import assert from "node:assert";
import { toAS2 } from "../../../plugins/instagram/as2.js";

describe("Instagram toAS2", () => {
  test("converts an image post to AS2", () => {
    const post = {
      shortcode: "ABC123", username: "testuser",
      timestamp: "2024-03-15T14:30:00.000Z", caption: "Hello world",
      location: { name: "Portland", id: "99" }, tagged_users: ["friend1"],
      alt_text: "A sunset photo", likes: 42, comments: 3,
      media: [{ type: "image", url: "https://cdn.example.com/img.jpg", file: "1.jpg" }],
    };
    const as2 = toAS2(post);
    assert.strictEqual(as2["@context"], "https://www.w3.org/ns/activitystreams");
    assert.strictEqual(as2.type, "Note");
    assert.strictEqual(as2.id, "https://www.instagram.com/p/ABC123/");
    assert.strictEqual(as2.published, "2024-03-15T14:30:00.000Z");
    assert.strictEqual(as2.attributedTo.name, "testuser");
    assert.strictEqual(as2.attributedTo.url, "https://www.instagram.com/testuser/");
    assert.strictEqual(as2.attachment[0].name, "A sunset photo");
    assert.strictEqual(as2.location.name, "Portland");
    assert.strictEqual(as2.tag[0].href, "https://www.instagram.com/friend1/");
    assert.strictEqual(as2.generator.name, "Instagram");
  });

  test("converts a carousel post", () => {
    const post = {
      shortcode: "XYZ789", username: "testuser",
      timestamp: "2024-03-15T14:30:00.000Z", caption: "Carousel!",
      location: null, tagged_users: [], alt_text: null, likes: 5, comments: 1,
      media: [{ type: "image", file: "1.jpg" }, { type: "image", file: "2.jpg" }, { type: "video", file: "3.mp4" }],
    };
    const as2 = toAS2(post);
    assert.strictEqual(as2.attachment.length, 3);
    assert.strictEqual(as2.attachment[2].type, "Video");
    assert.strictEqual(as2.attachment[2].mediaType, "video/mp4");
  });

  test("converts a video post", () => {
    const post = {
      shortcode: "VID111", username: "testuser",
      timestamp: "2024-03-15T14:30:00.000Z", caption: "",
      location: null, tagged_users: [], alt_text: null, likes: 0, comments: 0,
      media: [{ type: "video", file: "1.mp4" }],
    };
    const as2 = toAS2(post);
    assert.strictEqual(as2.attachment[0].type, "Video");
  });

  test("omits location when null", () => {
    const post = {
      shortcode: "LOC001", username: "testuser",
      timestamp: "2024-03-15T14:30:00.000Z", caption: "No location",
      location: null, tagged_users: [], alt_text: null, likes: 0, comments: 0,
      media: [{ type: "image", file: "1.jpg" }],
    };
    const as2 = toAS2(post);
    assert.strictEqual(as2.location, undefined);
  });

  test("alt_text only applies to first attachment", () => {
    const post = {
      shortcode: "ALT001", username: "testuser",
      timestamp: "2024-03-15T14:30:00.000Z", caption: "Alt test",
      location: null, tagged_users: [], alt_text: "Photo description", likes: 0, comments: 0,
      media: [{ type: "image", file: "1.jpg" }, { type: "image", file: "2.jpg" }],
    };
    const as2 = toAS2(post);
    assert.strictEqual(as2.attachment[0].name, "Photo description");
    assert.strictEqual(as2.attachment[1].name, undefined);
  });
});
