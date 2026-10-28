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

const SIGN_IN_PATH = "/user/sign_in";

export function isSignInUrl(url) {
  return typeof url === "string" && url.includes(SIGN_IN_PATH);
}

function looksLikeSignInPage(body) {
  return body.includes(SIGN_IN_PATH);
}

export function parseShelfXml(xml) {
  const parsed = parser.parse(xml);
  const channel = parsed.rss?.channel;
  // A shelf with no books still has an <rss><channel> root. Missing it means the
  // response isn't a feed at all — Goodreads serves its sign-in page with HTTP
  // 200, so this is the only place a signed-out session can be caught.
  if (!channel) {
    throw new Error(
      looksLikeSignInPage(xml)
        ? "Goodreads served its sign-in page instead of a feed — the session is signed out. Run: postkeeper init goodreads"
        : `Goodreads response was not RSS (${xml.length} bytes, no <rss><channel> root)`,
    );
  }

  const items = channel.item || [];
  return items.map(parseItem);
}

export function buildShelfUrl(userId, shelf) {
  return `https://www.goodreads.com/review/list/${userId}?shelf=${encodeURIComponent(shelf)}&format=rss`;
}

/**
 * Fetch and parse one shelf.
 *
 * getShelfPage(url) performs the request and resolves to
 * { url, ok, status, body }, where url is the final URL after redirects.
 * The plugin supplies a browser-context-backed implementation so the stored
 * Goodreads session cookies are applied; tests supply recorded responses.
 */
export async function fetchShelf(userId, shelf, getShelfPage) {
  const url = buildShelfUrl(userId, shelf);
  const page = await getShelfPage(url);

  if (!page.ok) {
    throw new Error(`Failed to fetch shelf "${shelf}": HTTP ${page.status}`);
  }
  if (isSignInUrl(page.url)) {
    throw new Error(
      `Not signed in to Goodreads — shelf "${shelf}" redirected to the sign-in page. Run: postkeeper init goodreads`,
    );
  }

  try {
    return parseShelfXml(page.body);
  } catch (err) {
    throw new Error(`Shelf "${shelf}": ${err.message}`);
  }
}
