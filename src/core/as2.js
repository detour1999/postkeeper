// src/core/as2.js

const PLATFORM_USER_URL = {
  instagram: (username) => `https://www.instagram.com/${username}/`,
};

function mediaTypeToAS2(type) {
  if (type === "video") return { type: "Video", mediaType: "video/mp4" };
  return { type: "Image", mediaType: "image/jpeg" };
}

export function toAS2(post, pluginName) {
  const userUrlFn = PLATFORM_USER_URL[pluginName];

  const as2 = {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Note",
    id: post.url,
    url: post.url,
    published: post.timestamp,
    attributedTo: {
      type: "Person",
      name: post.username,
      ...(userUrlFn ? { url: userUrlFn(post.username) } : {}),
    },
    content: post.caption,
    attachment: post.media.map((m, i) => {
      const base = mediaTypeToAS2(m.type);
      const obj = { ...base, url: m.file };
      if (i === 0 && post.alt_text) {
        obj.name = post.alt_text;
      }
      return obj;
    }),
    tag: (post.tagged_users || []).map((u) => ({
      type: "Mention",
      href: userUrlFn ? userUrlFn(u) : undefined,
      name: `@${u}`,
    })),
    likes: { type: "Collection", totalItems: post.likes || 0 },
    replies: { type: "Collection", totalItems: post.comments || 0 },
    generator: {
      type: "Application",
      name: pluginName.charAt(0).toUpperCase() + pluginName.slice(1),
    },
  };

  if (post.location) {
    as2.location = { type: "Place", name: post.location.name };
  }

  return as2;
}
