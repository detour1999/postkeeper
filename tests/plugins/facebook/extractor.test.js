// ABOUTME: Tests for Facebook extractor — flattenStory, parsePost, and isOwnPost.
// ABOUTME: Covers text, photo, video, shared link, check-in, and edge cases.
import { test, describe } from "node:test";
import assert from "node:assert";
import { flattenStory, parsePost, isOwnPost } from "../../../plugins/facebook/extractor.js";

function makeStory(overrides = {}) {
  return {
    __typename: "Story",
    post_id: "pfbid02abc",
    permalink_url: "https://www.facebook.com/dylanr/posts/pfbid02abc",
    actors: [{ name: "Dylan Richard", url: "https://www.facebook.com/dylanr", __typename: "User" }],
    attachments: [],
    place: null,
    comet_sections: {
      timestamp: { story: { creation_time: 1710510600 } },
      content: {
        story: {
          comet_sections: {
            message: {
              story: {
                message: { text: "Hello world" },
              },
            },
          },
        },
      },
      feedback: null,
      context_layout: null,
    },
    feedback: null,
    ...overrides,
  };
}

describe("Facebook flattenStory", () => {
  test("flattens a basic story", () => {
    const flat = flattenStory(makeStory());
    assert.strictEqual(flat.post_id, "pfbid02abc");
    assert.strictEqual(flat.creation_time, 1710510600);
    assert.strictEqual(flat.message_text, "Hello world");
    assert.strictEqual(flat.media.length, 0);
    assert.strictEqual(flat.shared_link, null);
    assert.strictEqual(flat.place, null);
    assert.strictEqual(flat.reactions, 0);
    assert.strictEqual(flat.comments, 0);
  });

  test("extracts photo subattachments", () => {
    const story = makeStory({
      attachments: [{
        media: { __typename: "Photo", id: "123" },
        styles: {
          attachment: {
            all_subattachments: {
              count: 2,
              nodes: [
                { media: { __typename: "Photo", is_playable: false, image: { uri: "https://cdn.fbcdn.net/img1.jpg" } } },
                { media: { __typename: "Photo", is_playable: false, image: { uri: "https://cdn.fbcdn.net/img2.jpg" } } },
              ],
            },
          },
        },
      }],
    });
    const flat = flattenStory(story);
    assert.strictEqual(flat.media.length, 2);
    assert.strictEqual(flat.media[0].__typename, "Photo");
    assert.strictEqual(flat.media[0].image.uri, "https://cdn.fbcdn.net/img1.jpg");
  });

  test("extracts video attachment", () => {
    const story = makeStory({
      attachments: [{
        media: { __typename: "Video", id: "456" },
        styles: {
          attachment: {
            all_subattachments: {
              count: 1,
              nodes: [
                { media: { __typename: "Video", is_playable: true, playable_url: "https://cdn.fbcdn.net/vid.mp4" } },
              ],
            },
          },
        },
      }],
    });
    const flat = flattenStory(story);
    assert.strictEqual(flat.media.length, 1);
    assert.strictEqual(flat.media[0].__typename, "Video");
    assert.strictEqual(flat.media[0].playable_url, "https://cdn.fbcdn.net/vid.mp4");
  });

  test("extracts reaction and comment counts from feedback section", () => {
    const feedbackSection = {
      story: {
        story_ufi_container: {
          story: {
            feedback_context: {
              feedback_target_with_context: {
                ufi_renderer: {
                  feedback: {
                    reaction_count: { count: 42 },
                    share_count: { count: 1 },
                    comment_rendering_instance: { comments: { total_count: 7 } },
                  },
                },
              },
            },
          },
        },
      },
    };
    const story = makeStory({
      comet_sections: {
        ...makeStory().comet_sections,
        feedback: feedbackSection,
      },
    });
    const flat = flattenStory(story);
    assert.strictEqual(flat.reactions, 42);
    assert.strictEqual(flat.comments, 7);
  });

  test("extracts place from story", () => {
    const story = makeStory({ place: { name: "Portland, Oregon" } });
    const flat = flattenStory(story);
    assert.deepStrictEqual(flat.place, { name: "Portland, Oregon" });
  });

  test("handles missing message gracefully", () => {
    const story = makeStory({
      comet_sections: {
        ...makeStory().comet_sections,
        content: { story: { comet_sections: { message: null } } },
      },
    });
    const flat = flattenStory(story);
    assert.strictEqual(flat.message_text, "");
  });

  test("extracts shared link from attachment target", () => {
    const story = makeStory({
      attachments: [{
        styles: {
          attachment: {
            target: { url: "https://example.com/article", title: "Cool Article" },
          },
        },
      }],
    });
    const flat = flattenStory(story);
    assert.deepStrictEqual(flat.shared_link, { url: "https://example.com/article", title: "Cool Article" });
  });
});

describe("Facebook parsePost", () => {
  test("converts a flattened node to post format", () => {
    const node = {
      post_id: "pfbid02abc",
      permalink_url: "https://www.facebook.com/dylanr/posts/pfbid02abc",
      creation_time: 1710510600,
      message_text: "Hello world",
      media: [],
      shared_link: null,
      place: null,
      reactions: 42,
      comments: 3,
      actors: [{ name: "Dylan Richard" }],
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.strictEqual(post.postId, "pfbid02abc");
    assert.strictEqual(post.permalinkUrl, "https://www.facebook.com/dylanr/posts/pfbid02abc");
    assert.strictEqual(post.content, "Hello world");
    assert.strictEqual(post.timestamp, "2024-03-15T13:50:00.000Z");
    assert.strictEqual(post.reactions, 42);
    assert.strictEqual(post.comments, 3);
    assert.strictEqual(post.media.length, 0);
    assert.strictEqual(post.sharedLink, null);
    assert.strictEqual(post.location, null);
  });

  test("converts photo media to image entries", () => {
    const node = {
      post_id: "pfbid02photo",
      creation_time: 1710510600,
      message_text: "Photos!",
      media: [
        { __typename: "Photo", image: { uri: "https://cdn.fbcdn.net/img1.jpg" } },
        { __typename: "Photo", image: { uri: "https://cdn.fbcdn.net/img2.jpg" } },
      ],
      shared_link: null,
      place: null,
      reactions: 0,
      comments: 0,
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.strictEqual(post.media.length, 2);
    assert.strictEqual(post.media[0].type, "image");
    assert.strictEqual(post.media[0].url, "https://cdn.fbcdn.net/img1.jpg");
    assert.strictEqual(post.media[0].file, "1.jpg");
    assert.strictEqual(post.media[1].file, "2.jpg");
  });

  test("converts video media to video entries", () => {
    const node = {
      post_id: "pfbid02vid",
      creation_time: 1710510600,
      message_text: "Video!",
      media: [
        { __typename: "Video", is_playable: true, playable_url: "https://cdn.fbcdn.net/vid.mp4" },
      ],
      shared_link: null,
      place: null,
      reactions: 0,
      comments: 0,
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.strictEqual(post.media.length, 1);
    assert.strictEqual(post.media[0].type, "video");
    assert.strictEqual(post.media[0].url, "https://cdn.fbcdn.net/vid.mp4");
    assert.strictEqual(post.media[0].file, "1.mp4");
  });

  test("passes through shared link and location", () => {
    const node = {
      post_id: "pfbid02combo",
      creation_time: 1710510600,
      message_text: "At a place",
      media: [],
      shared_link: { url: "https://example.com", title: "Example" },
      place: { name: "Portland, Oregon" },
      reactions: 5,
      comments: 1,
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.deepStrictEqual(post.sharedLink, { url: "https://example.com", title: "Example" });
    assert.deepStrictEqual(post.location, { name: "Portland, Oregon" });
  });

  test("handles missing fields gracefully", () => {
    const node = {
      post_id: "pfbid02empty",
      creation_time: null,
      message_text: "",
      media: [],
      shared_link: null,
      place: null,
      reactions: 0,
      comments: 0,
    };
    const post = parsePost(node, "https://www.facebook.com/dylanr", "dylanr");
    assert.strictEqual(post.content, "");
    assert.strictEqual(post.timestamp, null);
    assert.strictEqual(post.reactions, 0);
    assert.strictEqual(post.comments, 0);
  });
});

describe("Facebook isOwnPost", () => {
  test("returns true when actor URL matches profile URL", () => {
    const story = {
      actors: [{ name: "Dylan Richard", url: "https://www.facebook.com/dylanr" }],
    };
    assert.strictEqual(isOwnPost(story, "https://www.facebook.com/dylanr"), true);
  });

  test("returns false when actor URL does not match profile URL", () => {
    const story = {
      actors: [{ name: "Kieran Delaney", url: "https://www.facebook.com/kieranjdelaney" }],
    };
    assert.strictEqual(isOwnPost(story, "https://www.facebook.com/dylanr"), false);
  });

  test("handles trailing slashes in URLs", () => {
    const story = {
      actors: [{ name: "Dylan Richard", url: "https://www.facebook.com/dylanr/" }],
    };
    assert.strictEqual(isOwnPost(story, "https://www.facebook.com/dylanr"), true);
  });

  test("is case-insensitive", () => {
    const story = {
      actors: [{ name: "Dylan Richard", url: "https://www.facebook.com/DylanR" }],
    };
    assert.strictEqual(isOwnPost(story, "https://www.facebook.com/dylanr"), true);
  });

  test("returns true when actors array is empty", () => {
    const story = { actors: [] };
    assert.strictEqual(isOwnPost(story, "https://www.facebook.com/dylanr"), true);
  });

  test("returns true when actors field is missing", () => {
    const story = {};
    assert.strictEqual(isOwnPost(story, "https://www.facebook.com/dylanr"), true);
  });
});
