// ABOUTME: Converts parsed Facebook post data into ActivityStreams 2.0 format.
// ABOUTME: Handles text, photo, video, shared link, and check-in posts.

function mediaTypeToAS2(type) {
  if (type === "video") return { type: "Video", mediaType: "video/mp4" };
  return { type: "Image", mediaType: "image/jpeg" };
}

export function toAS2(post) {
  const postUrl = post.permalinkUrl || `${post.profileUrl}/posts/${post.postId}`;

  const attachment = post.media.map((m) => ({
    ...mediaTypeToAS2(m.type),
    url: m.file,
  }));

  if (post.sharedLink) {
    attachment.push({
      type: "Link",
      href: post.sharedLink.url,
      name: post.sharedLink.title || "",
    });
  }

  const as2 = {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Note",
    id: postUrl,
    url: postUrl,
    published: post.timestamp,
    attributedTo: {
      type: "Person",
      name: post.profileName,
      url: post.profileUrl,
    },
    content: post.content,
    attachment,
    likes: { type: "Collection", totalItems: post.reactions || 0 },
    replies: { type: "Collection", totalItems: post.comments || 0 },
    generator: { type: "Application", name: "Facebook" },
  };

  if (post.location) {
    as2.location = { type: "Place", name: post.location.name };
  }

  return as2;
}
