// ABOUTME: Extracts and parses Facebook post data from GraphQL API responses.
// ABOUTME: Handles profile scrolling, Story node flattening, and raw node parsing.

/**
 * Flatten a Facebook Story GraphQL object into a normalized node for parsePost.
 * Facebook nests data deeply in comet_sections — this pulls it all to the top level.
 */
export function flattenStory(story) {
  const creationTime =
    story.comet_sections?.timestamp?.story?.creation_time ?? null;

  // Message text is deeply nested in comet_sections.content
  const messageText =
    story.comet_sections?.content?.story?.comet_sections?.message?.story
      ?.message?.text || "";

  // Attachments: extract subattachments (photos/videos) from styles
  const rawAttachments = story.attachments || [];
  const media = [];
  for (const att of rawAttachments) {
    const subs = att?.styles?.attachment?.all_subattachments?.nodes;
    if (subs) {
      for (const sub of subs) {
        const m = sub.media;
        if (!m) continue;
        media.push(m);
      }
    } else if (att?.media) {
      // Single attachment without subattachments
      media.push(att.media);
    }
  }

  // Shared link: look for target on attachment
  let sharedLink = null;
  for (const att of rawAttachments) {
    const target = att?.styles?.attachment?.target;
    if (target?.url) {
      sharedLink = { url: target.url, title: target.title || "" };
      break;
    }
  }

  // Reaction and comment counts from feedback section
  let reactions = 0;
  let comments = 0;
  const feedbackSection = story.comet_sections?.feedback;
  if (feedbackSection) {
    const fbStr = JSON.stringify(feedbackSection);
    const reactionMatch = fbStr.match(/"reaction_count":\{"count":(\d+)/);
    if (reactionMatch) reactions = parseInt(reactionMatch[1], 10);
    const commentMatch = fbStr.match(
      /"comment_rendering_instance":\{"comments":\{"total_count":(\d+)\}/,
    );
    if (commentMatch) comments = parseInt(commentMatch[1], 10);
  }

  // Location: check for place in story_to_place or context_layout
  let place = null;
  if (story.place) {
    place = { name: story.place.name };
  }

  return {
    post_id: story.post_id,
    permalink_url: story.permalink_url,
    creation_time: creationTime,
    message_text: messageText,
    media,
    shared_link: sharedLink,
    reactions,
    comments,
    place,
    actors: story.actors || [],
  };
}

/**
 * Parse a flattened Facebook post node into our clean post format.
 */
export function parsePost(node, profileUrl, profileName) {
  const content = node.message_text || "";
  const timestamp = node.creation_time
    ? new Date(node.creation_time * 1000).toISOString()
    : null;

  const media = (node.media || []).map((m, i) => {
    const isVideo =
      m.__typename === "Video" || m.is_playable === true || m.playable_url;
    if (isVideo) {
      return {
        type: "video",
        url: m.playable_url || m.browser_native_sd_url || "",
        file: `${i + 1}.mp4`,
      };
    }
    return {
      type: "image",
      url: m.image?.uri || m.uri || "",
      file: `${i + 1}.jpg`,
    };
  });

  const sharedLink = node.shared_link || null;
  const location = node.place || null;

  return {
    postId: node.post_id,
    profileUrl,
    profileName,
    timestamp,
    content,
    location,
    reactions: node.reactions || 0,
    comments: node.comments || 0,
    media,
    sharedLink,
  };
}

/**
 * Fetch posts from a Facebook profile by intercepting GraphQL responses.
 * Scrolls until we find posts older than lastSeenTimestamp, or no more pages.
 *
 * Intercepts GraphQL responses, finds Story objects, flattens them into
 * normalized nodes, and returns them for processing.
 */
/* c8 ignore start -- requires Playwright browser page, tested manually */
export async function fetchProfilePosts(
  page,
  profileUrl,
  lastSeenTimestamp = null,
  log = () => {},
) {
  const posts = [];
  const seenIds = new Set();
  let batchReceived = false;
  let noNewBatches = 0;

  const handler = async (response) => {
    const url = response.url();
    if (!url.includes("/api/graphql") && !url.includes("/graphql/")) return;

    try {
      const text = await response.text();
      log(`GraphQL response: ${text.length} bytes`);
      // Facebook sends newline-delimited JSON
      const lines = text.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          const stories = findStoryNodes(json);
          if (stories.length > 0) {
            log(`Found ${stories.length} Story node(s) in response`);
          }
          for (const story of stories) {
            if (story.post_id && !seenIds.has(String(story.post_id))) {
              seenIds.add(String(story.post_id));
              const flat = flattenStory(story);
              // Skip stories without a permalink (aggregated/suggested content)
              if (flat.permalink_url) {
                posts.push(flat);
                batchReceived = true;
                log(`  Post ${flat.post_id}: ${flat.message_text?.slice(0, 60) || "(no text)"}...`);
              }
            }
          }
        } catch {
          // Not valid JSON line
        }
      }
    } catch {
      // Not the response we're looking for
    }
  };

  page.on("response", handler);

  try {
    await page.goto(profileUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    // Scroll to load more posts
    while (noNewBatches < 3) {
      if (lastSeenTimestamp) {
        const oldestPost = posts[posts.length - 1];
        if (oldestPost && oldestPost.creation_time) {
          const oldestTs = new Date(
            oldestPost.creation_time * 1000,
          ).toISOString();
          if (oldestTs <= lastSeenTimestamp) {
            break;
          }
        }
      }

      batchReceived = false;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      const start = Date.now();
      while (!batchReceived && Date.now() - start < 10000) {
        await page.waitForTimeout(500);
      }

      if (!batchReceived) {
        noNewBatches++;
      } else {
        noNewBatches = 0;
      }

      await page.waitForTimeout(1000 + Math.random() * 1000);
    }
  } finally {
    page.removeListener("response", handler);
  }

  return posts;
}

/**
 * Recursively search a JSON object for Story nodes.
 * A Story node has __typename === "Story" and a post_id.
 */
function findStoryNodes(obj, results = []) {
  if (!obj || typeof obj !== "object") return results;

  if (obj.__typename === "Story" && obj.post_id) {
    results.push(obj);
    return results;
  }

  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        findStoryNodes(item, results);
      }
    } else if (val && typeof val === "object") {
      findStoryNodes(val, results);
    }
  }

  return results;
}
/* c8 ignore stop */
