// plugins/rss/parser.js
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => ["item", "entry", "category", "enclosure", "link"].includes(name),
});

function enclosureToAttachment(enc) {
  const url = enc["@_url"];
  const mediaType = enc["@_type"] || "application/octet-stream";
  let type = "Link";
  if (mediaType.startsWith("audio/")) type = "Audio";
  else if (mediaType.startsWith("video/")) type = "Video";
  else if (mediaType.startsWith("image/")) type = "Image";
  return { type, mediaType, url };
}

function parseRSSItem(item, feedName) {
  const title = item.title || "";
  const link = typeof item.link === "string" ? item.link : item.link?.[0] || "";
  const content = item["content:encoded"] || item.description || "";
  const pubDate = item.pubDate ? new Date(item.pubDate).toISOString() : null;
  const author = item["dc:creator"] || item.author || feedName;

  const categories = (item.category || []).map((c) => {
    const name = typeof c === "string" ? c : c["#text"] || c;
    return { type: "Object", name };
  });

  const enclosures = (item.enclosure || []).map(enclosureToAttachment);

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Article",
    id: link,
    url: link,
    name: title,
    content,
    published: pubDate,
    attributedTo: { type: "Person", name: author },
    tag: categories,
    attachment: enclosures,
    generator: { type: "Application", name: feedName },
  };
}

function parseAtomEntry(entry, feedName) {
  const title = entry.title || "";
  const links = entry.link || [];
  const link = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate");
  const href = link?.["@_href"] || links[0]?.["@_href"] || "";
  const content = typeof entry.content === "object" ? entry.content["#text"] || "" : entry.content || "";
  const published = entry.published || entry.updated || null;
  const pubISO = published ? new Date(published).toISOString() : null;
  const author = entry.author?.name || feedName;

  const categories = (entry.category || []).map((c) => ({
    type: "Object",
    name: c["@_term"] || c["@_label"] || "",
  }));

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Article",
    id: href,
    url: href,
    name: title,
    content,
    published: pubISO,
    attributedTo: { type: "Person", name: author },
    tag: categories,
    attachment: [],
    generator: { type: "Application", name: feedName },
  };
}

export function parseFeed(xml, feedName) {
  const parsed = parser.parse(xml);

  // RSS format
  if (parsed.rss?.channel) {
    const channel = parsed.rss.channel;
    const items = channel.item || [];
    return items.map((item) => parseRSSItem(item, feedName));
  }

  // Atom format
  if (parsed.feed) {
    const entries = parsed.feed.entry || [];
    return entries.map((entry) => parseAtomEntry(entry, feedName));
  }

  return [];
}
