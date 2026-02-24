// plugins/instagram/as2.js
function mediaTypeToAS2(type) {
  if (type === "video") return { type: "Video", mediaType: "video/mp4" };
  return { type: "Image", mediaType: "image/jpeg" };
}

export function toAS2(post) {
  const as2 = {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Note",
    id: `https://www.instagram.com/p/${post.shortcode}/`,
    url: `https://www.instagram.com/p/${post.shortcode}/`,
    published: post.timestamp,
    attributedTo: {
      type: "Person",
      name: post.username,
      url: `https://www.instagram.com/${post.username}/`,
    },
    content: post.caption,
    attachment: post.media.map((m, i) => {
      const base = mediaTypeToAS2(m.type);
      const obj = { ...base, url: m.file };
      if (i === 0 && post.alt_text) obj.name = post.alt_text;
      return obj;
    }),
    tag: (post.tagged_users || []).map((u) => ({
      type: "Mention",
      href: `https://www.instagram.com/${u}/`,
      name: `@${u}`,
    })),
    likes: { type: "Collection", totalItems: post.likes || 0 },
    replies: { type: "Collection", totalItems: post.comments || 0 },
    generator: { type: "Application", name: "Instagram" },
  };

  if (post.location) {
    as2.location = { type: "Place", name: post.location.name };
  }

  return as2;
}
