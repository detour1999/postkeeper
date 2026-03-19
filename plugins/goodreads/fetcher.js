// ABOUTME: Fetches and parses Goodreads RSS shelf feeds into book objects.
// ABOUTME: Uses fast-xml-parser to handle CDATA sections and custom Goodreads fields.
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "item",
  // Disable number parsing to preserve leading zeros in ISBNs and other identifiers
  numberParseOptions: { leadingZeros: false, hex: false },
});

function parseItem(item) {
  const title = item.title || "";
  const bookId = String(item.book_id || "");
  const author = item.author_name || "";
  const isbn = item.isbn != null ? String(item.isbn) : "";
  const rating = parseInt(item.user_rating, 10) || 0;
  const averageRating = item.average_rating != null ? String(item.average_rating) : "";
  const yearPublished = item.book_published ? String(item.book_published) : "";
  const review = item.user_review || "";
  const permalinkUrl = item.link || "";

  const coverUrl = item.book_large_image_url || item.book_image_url || "";

  const shelvesRaw = item.user_shelves || "";
  const shelves = shelvesRaw
    ? shelvesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const pubDateRaw = item.pubDate || "";
  const pubDate = pubDateRaw ? new Date(pubDateRaw).toISOString() : null;

  const readAtRaw = item.user_read_at || "";
  const readAt = readAtRaw ? new Date(readAtRaw).toISOString() : null;

  // started = earliest of pubDate and user_read_at
  // finished = latest of the two (if both exist), otherwise whichever we have
  let started = null;
  let finished = null;
  if (pubDate && readAt) {
    started = pubDate < readAt ? pubDate : readAt;
    finished = pubDate < readAt ? readAt : pubDate;
  } else {
    started = pubDate || readAt;
  }

  return {
    bookId,
    title,
    author,
    isbn,
    rating,
    averageRating,
    yearPublished,
    review,
    shelves,
    coverUrl,
    permalinkUrl,
    started,
    finished,
  };
}

export function parseShelfXml(xml) {
  const parsed = parser.parse(xml);
  const channel = parsed.rss?.channel;
  if (!channel) return [];

  const items = channel.item || [];
  return items.map(parseItem);
}

export async function fetchShelf(userId, shelf) {
  const url = `https://www.goodreads.com/review/list_rss/${userId}?shelf=${encodeURIComponent(shelf)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch shelf "${shelf}": HTTP ${response.status}`,
    );
  }
  const xml = await response.text();
  return parseShelfXml(xml);
}
