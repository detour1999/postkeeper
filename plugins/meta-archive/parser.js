// plugins/meta-archive/parser.js

export function fixMetaEncoding(text) {
  if (!text) return "";
  // Meta double-encodes UTF-8: each byte of the UTF-8 sequence is stored as a \u00xx escape.
  // We detect sequences of Latin-1 chars in the C0-FF range and decode them as UTF-8 bytes.
  try {
    // Convert string to bytes treating each char as a Latin-1 byte, then decode as UTF-8
    const bytes = new Uint8Array([...text].map((c) => c.charCodeAt(0)));
    const decoded = new TextDecoder("utf-8").decode(bytes);
    // If decoding produced replacement chars, the original wasn't double-encoded
    if (decoded.includes("\uFFFD")) return text;
    return decoded;
  } catch /* c8 ignore next */ {
    return text;
  }
}

function mediaTypeFromUri(uri) {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".mp4") || lower.endsWith(".mov")) return { type: "Video", mediaType: "video/mp4" };
  if (lower.endsWith(".webp")) return { type: "Image", mediaType: "image/webp" };
  if (lower.endsWith(".png")) return { type: "Image", mediaType: "image/png" };
  return { type: "Image", mediaType: "image/jpeg" };
}

export function parseInstagramJSON(posts, username) {
  return posts.map((post, index) => {
    const timestamp = post.creation_timestamp || (post.media?.[0]?.creation_timestamp) || 0;
    const published = timestamp ? new Date(timestamp * 1000).toISOString() : new Date(0).toISOString();
    const caption = fixMetaEncoding(post.title || "");
    const mediaItems = post.media || [];
    const mediaUris = mediaItems.map((m) => m.uri);

    // Derive a post ID from the first media filename or index
    const firstMedia = mediaItems[0];
    const postId = firstMedia ? firstMedia.uri.split("/").pop().replace(/\.\w+$/, "") : `post-${index}`;

    const as2 = {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Note",
      id: `meta-archive:instagram:${postId}`,
      published,
      attributedTo: { type: "Person", name: username },
      content: caption,
      attachment: mediaItems.map((m) => ({
        ...mediaTypeFromUri(m.uri),
        url: m.uri.split("/").pop(),
      })),
      generator: { type: "Application", name: "Instagram" },
    };

    return { as2, raw: post, mediaUris };
  });
}

export function parseFacebookJSON(posts, username) {
  return posts.map((post, index) => {
    const timestamp = post.timestamp || 0;
    const published = timestamp ? new Date(timestamp * 1000).toISOString() : new Date(0).toISOString();

    // Extract post text from data array
    const dataEntries = post.data || [];
    const textEntry = dataEntries.find((d) => d.post);
    const caption = fixMetaEncoding(textEntry?.post || "");

    // Extract media URIs from attachments
    const mediaUris = [];
    const attachmentItems = [];
    for (const attachment of post.attachments || []) {
      for (const item of attachment.data || []) {
        if (item.media?.uri) {
          mediaUris.push(item.media.uri);
          attachmentItems.push({
            ...mediaTypeFromUri(item.media.uri),
            url: item.media.uri.split("/").pop(),
          });
        }
      }
    }

    // Derive post ID from first media or index
    const postId = mediaUris.length > 0
      ? mediaUris[0].split("/").pop().replace(/\.\w+$/, "")
      : `post-${index}`;

    const as2 = {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Note",
      id: `meta-archive:facebook:${postId}`,
      published,
      attributedTo: { type: "Person", name: username },
      content: caption,
      attachment: attachmentItems,
      generator: { type: "Application", name: "Facebook" },
    };

    return { as2, raw: post, mediaUris };
  });
}

export function parseInstagramHTML(html, username) {
  const posts = [];

  // Each post is a div.pam block
  const blocks = html.split(/<div class="pam _3-95 _2ph- _a6-g uiBoxWhite noborder">/).slice(1);

  for (const [index, block] of blocks.entries()) {
    // Extract caption from h2
    const captionMatch = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    const caption = captionMatch ? captionMatch[1].replace(/&#039;/g, "'").replace(/&#064;/g, "@").replace(/&amp;/g, "&").replace(/<[^>]+>/g, "").trim() : "";

    // Extract media hrefs
    const mediaUris = [];
    const hrefPattern = /href="(media\/posts\/[^"]+)"/g;
    let hrefMatch;
    while ((hrefMatch = hrefPattern.exec(block)) !== null) {
      mediaUris.push(hrefMatch[1]);
    }

    // Extract timestamp
    const tsMatch = block.match(/<div class="_3-94 _a6-o">([^<]+)<\/div>/);
    const tsText = tsMatch ? tsMatch[1].trim() : "";
    const published = tsText ? new Date(tsText).toISOString() : new Date().toISOString();

    const postId = mediaUris.length > 0
      ? mediaUris[0].split("/").pop().replace(/\.\w+$/, "")
      : `html-post-${index}`;

    const as2 = {
      "@context": "https://www.w3.org/ns/activitystreams",
      type: "Note",
      id: `meta-archive:instagram:${postId}`,
      published,
      attributedTo: { type: "Person", name: username },
      content: fixMetaEncoding(caption),
      attachment: mediaUris.map((uri) => ({
        ...mediaTypeFromUri(uri),
        url: uri.split("/").pop(),
      })),
      generator: { type: "Application", name: "Instagram" },
    };

    posts.push({ as2, raw: { html_caption: caption, media_uris: mediaUris, timestamp: tsText }, mediaUris });
  }

  return posts;
}
