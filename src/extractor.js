// src/extractor.js

/**
 * Parse an Instagram GraphQL media node into our clean post format.
 */
export function parsePostFromGraphQL(node) {
  const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text || "";
  const timestamp = new Date(node.taken_at_timestamp * 1000).toISOString();
  const username = node.owner?.username || "";

  let media_type;
  let media = [];

  if (node.__typename === "GraphSidecar" || node.edge_sidecar_to_children) {
    media_type = "carousel";
    const children = node.edge_sidecar_to_children?.edges || [];
    media = children.map((edge, i) => {
      const child = edge.node;
      if (child.is_video) {
        return { type: "video", url: child.video_url, file: `${i + 1}.mp4` };
      }
      return { type: "image", url: child.display_url, file: `${i + 1}.jpg` };
    });
  } else if (node.is_video) {
    media_type = "video";
    media = [{ type: "video", url: node.video_url, file: "1.mp4" }];
  } else {
    media_type = "image";
    media = [{ type: "image", url: node.display_url, file: "1.jpg" }];
  }

  const tagged_users = (node.edge_media_to_tagged_user?.edges || []).map(
    (e) => e.node.user.username,
  );

  return {
    shortcode: node.shortcode,
    url: `https://www.instagram.com/p/${node.shortcode}/`,
    id: node.id,
    username,
    timestamp,
    caption,
    location: node.location
      ? { name: node.location.name, id: node.location.id }
      : null,
    tagged_users,
    alt_text: node.accessibility_caption || null,
    likes: node.edge_media_preview_like?.count || 0,
    comments: node.edge_media_to_comment?.count || 0,
    media_type,
    media,
  };
}

/**
 * Fetch the post list from a profile page by intercepting GraphQL responses.
 * Returns an array of raw GraphQL media nodes.
 */
export async function fetchProfilePosts(page, username) {
  const posts = [];

  const responsePromise = new Promise((resolve) => {
    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("/graphql/query") || url.includes("/api/graphql")) {
        try {
          const json = await response.json();
          const user = json?.data?.user;
          const media = user?.edge_owner_to_timeline_media;
          if (media?.edges) {
            for (const edge of media.edges) {
              posts.push(edge.node);
            }
            resolve();
          }
        } catch {
          // Not the response we're looking for
        }
      }
    });
  });

  await page.goto(`https://www.instagram.com/${username}/`, {
    waitUntil: "networkidle",
  });

  await Promise.race([
    responsePromise,
    new Promise((r) => setTimeout(r, 15000)),
  ]);

  return posts;
}

/**
 * Fetch full post details (including all carousel items) by navigating to the post permalink.
 * Returns the full GraphQL media node.
 */
export async function fetchPostDetails(page, shortcode) {
  let postNode = null;

  const responsePromise = new Promise((resolve) => {
    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("/graphql/query") || url.includes("/api/graphql")) {
        try {
          const json = await response.json();
          const media = json?.data?.shortcode_media;
          if (media && media.shortcode === shortcode) {
            postNode = media;
            resolve();
          }
        } catch {
          // Not the response we're looking for
        }
      }
    });
  });

  await page.goto(`https://www.instagram.com/p/${shortcode}/`, {
    waitUntil: "networkidle",
  });

  await Promise.race([
    responsePromise,
    new Promise((r) => setTimeout(r, 15000)),
  ]);

  return postNode;
}
