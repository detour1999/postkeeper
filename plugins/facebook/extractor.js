// ABOUTME: Extracts and parses Facebook post data from GraphQL API responses.
// ABOUTME: Handles profile scrolling, post detail fetching, and raw node parsing.

/**
 * Parse a raw Facebook GraphQL post node into our clean post format.
 * The exact field names may need adjustment after inspecting real GraphQL responses.
 */
export function parsePost(node, profileUrl, profileName) {
  const content = node.message?.text || "";
  const timestamp = new Date(node.creation_time * 1000).toISOString();

  const media = (node.attached_media || []).map((item, i) => {
    const m = item.media || item;
    const isVideo = m.__typename === "Video" || m.playable_url;
    if (isVideo) {
      return { type: "video", url: m.playable_url, file: `${i + 1}.mp4` };
    }
    return { type: "image", url: m.image?.uri || m.uri, file: `${i + 1}.jpg` };
  });

  const sharedLink = node.attached_link
    ? { url: node.attached_link.url, title: node.attached_link.title || "" }
    : null;

  const location = node.place ? { name: node.place.name } : null;

  return {
    postId: node.post_id,
    profileUrl,
    profileName,
    timestamp,
    content,
    location,
    reactions: node.feedback?.reaction_count?.count || 0,
    comments: node.feedback?.comment_count?.total_count || 0,
    media,
    sharedLink,
  };
}

/**
 * Fetch posts from a Facebook profile by intercepting GraphQL responses.
 * Scrolls until we find posts older than lastSeenTimestamp, or no more pages.
 *
 * NOTE: The GraphQL response format needs to be discovered by intercepting
 * real responses. The field names and nesting may differ from what's assumed here.
 * This function will likely need adjustment after initial testing with real data.
 */
/* c8 ignore start -- requires Playwright browser page, tested manually */
export async function fetchProfilePosts(page, profileUrl, lastSeenTimestamp = null) {
  const posts = [];
  let batchReceived = false;
  let noNewBatches = 0;

  const handler = async (response) => {
    const url = response.url();
    if (!url.includes("/api/graphql") && !url.includes("/graphql/")) return;

    try {
      const json = await response.json();
      const str = JSON.stringify(json);
      // Look for timeline post nodes — exact key TBD from real responses
      if (str.includes("creation_time") && str.includes("post_id")) {
        // Walk the response tree to find post nodes
        const found = findPostNodes(json);
        for (const node of found) {
          if (node.post_id && !posts.some((p) => p.post_id === node.post_id)) {
            posts.push(node);
            batchReceived = true;
          }
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
        if (oldestPost) {
          const oldestTs = new Date(oldestPost.creation_time * 1000).toISOString();
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
 * Recursively search a JSON object for post nodes.
 * A post node has at minimum: post_id and creation_time.
 */
function findPostNodes(obj, results = []) {
  if (!obj || typeof obj !== "object") return results;

  if (obj.post_id && obj.creation_time) {
    results.push(obj);
    return results;
  }

  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        findPostNodes(item, results);
      }
    } else if (val && typeof val === "object") {
      findPostNodes(val, results);
    }
  }

  return results;
}
/* c8 ignore stop */
