// ABOUTME: Pure helpers and timeline-scrape orchestration for the Instagram plugin —
// ABOUTME: parses listing-card nodes into post format and detects logged-in state from cookies.

/**
 * Returns true if the cookies contain a non-empty, unexpired Instagram session cookie.
 * Used by status() to detect logged-out state without relying on DOM heuristics that
 * silently false-positive in headless Chromium.
 *
 * Note: this only verifies cookie presence and local expiry. Server-side invalidation
 * (logout elsewhere, password change) is not detectable without an actual network call.
 */
export function hasInstagramSession(cookies) {
  if (!Array.isArray(cookies)) return false;
  const nowSeconds = Date.now() / 1000;
  return cookies.some((c) => {
    if (c.name !== "sessionid") return false;
    if (typeof c.value !== "string" || c.value.length === 0) return false;
    // Playwright represents session cookies (no on-disk expiry) as expires === -1.
    // A missing expires field is treated the same way.
    if (c.expires === undefined || c.expires === -1) return true;
    return c.expires > nowSeconds;
  });
}

/**
 * Extract the best image URL from an image_versions2 object.
 */
function bestImageUrl(imageVersions) {
  const candidates = imageVersions?.candidates;
  if (!candidates || candidates.length === 0) return null;
  // First candidate is typically the highest quality
  return candidates[0].url;
}

/**
 * Extract the best video URL from a video_versions array.
 */
function bestVideoUrl(videoVersions) {
  if (!videoVersions || videoVersions.length === 0) return null;
  return videoVersions[0].url;
}

/**
 * Parse a media node from Instagram's current API format into our clean post format.
 * media_type: 1 = image, 2 = video, 8 = carousel
 */
export function parsePost(node) {
  const caption = node.caption?.text || "";
  const timestamp = new Date(node.taken_at * 1000).toISOString();
  const username = node.user?.username || "";
  const shortcode = node.code;

  let media_type;
  let media = [];

  if (node.media_type === 8 && node.carousel_media) {
    media_type = "carousel";
    media = node.carousel_media.map((item, i) => {
      if (item.media_type === 2 && item.video_versions) {
        return { type: "video", url: bestVideoUrl(item.video_versions), file: `${i + 1}.mp4` };
      }
      return { type: "image", url: bestImageUrl(item.image_versions2), file: `${i + 1}.jpg` };
    });
  } else if (node.media_type === 2) {
    media_type = "video";
    media = [{ type: "video", url: bestVideoUrl(node.video_versions), file: "1.mp4" }];
  } else {
    media_type = "image";
    media = [{ type: "image", url: bestImageUrl(node.image_versions2), file: "1.jpg" }];
  }

  const tagged_users = (node.usertags?.in || []).map((t) => t.user?.username).filter(Boolean);

  return {
    shortcode,
    url: `https://www.instagram.com/p/${shortcode}/`,
    id: node.id || node.pk,
    username,
    timestamp,
    caption,
    location: node.location
      ? { name: node.location.name, id: node.location.pk || node.location.id }
      : null,
    tagged_users,
    alt_text: node.accessibility_caption || null,
    likes: node.like_count || 0,
    comments: node.comment_count || 0,
    media_type,
    media,
  };
}

/**
 * Fetch the post list from a profile page by intercepting GraphQL responses.
 * Scrolls to load more posts until we find one older than lastSeenTimestamp,
 * or until there are no more pages.
 * Returns an array of raw post nodes from the timeline.
 */
/* c8 ignore start -- requires Playwright browser page, tested manually */
export async function fetchProfilePosts(page, username, lastSeenTimestamp = null) {
  const posts = [];
  let hasNextPage = true;
  let batchReceived = false;

  const handler = async (response) => {
    const url = response.url();
    if (url.includes("/graphql/query") || url.includes("/api/graphql")) {
      try {
        const json = await response.json();
        const dataKeys = Object.keys(json?.data || {});
        const timelineKey = dataKeys.find((k) => k.includes("user_timeline"));
        if (timelineKey) {
          const timeline = json.data[timelineKey];
          const edges = timeline?.edges || [];
          for (const edge of edges) {
            posts.push(edge.node);
          }
          hasNextPage = timeline?.page_info?.has_next_page ?? false;
          batchReceived = true;
        }
      } catch {
        // Not the response we're looking for
      }
    }
  };

  page.on("response", handler);

  try {
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: "domcontentloaded",
    });

    // Wait for initial batch
    await page.waitForTimeout(5000);

    // Keep scrolling until we've gone past lastSeenTimestamp or run out of pages
    while (hasNextPage) {
      // Check if the oldest post we have is already older than our last seen
      if (lastSeenTimestamp) {
        const oldestPost = posts[posts.length - 1];
        if (oldestPost) {
          const oldestTs = new Date(oldestPost.taken_at * 1000).toISOString();
          if (oldestTs <= lastSeenTimestamp) {
            // We've scrolled past what we've seen before
            break;
          }
        }
      }

      // Scroll to trigger loading more
      batchReceived = false;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      // Wait for the next batch (up to 8 seconds)
      const start = Date.now();
      while (!batchReceived && Date.now() - start < 8000) {
        await page.waitForTimeout(500);
      }

      if (!batchReceived) {
        // No new batch arrived, stop
        break;
      }

      // Small delay to be polite
      await page.waitForTimeout(1000 + Math.random() * 1000);
    }
  } finally {
    page.removeListener("response", handler);
  }

  return posts;
}
/* c8 ignore stop */
