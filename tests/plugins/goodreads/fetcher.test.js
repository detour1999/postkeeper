// ABOUTME: Tests for Goodreads RSS fetcher — XML parsing of shelf feeds.
// ABOUTME: Uses fixture XML to verify book field extraction and edge cases.
import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseShelfXml,
  buildShelfUrl,
  fetchShelf,
  isSignInUrl,
} from "../../../plugins/goodreads/fetcher.js";

const fixturesDir = join(import.meta.dirname, "../../fixtures");

describe("Goodreads buildShelfUrl", () => {
  test("uses review/list path with format=rss", () => {
    const url = buildShelfUrl("12345", "read");
    assert.ok(url.includes("/review/list/12345"), `Expected /review/list/12345 in ${url}`);
    assert.ok(url.includes("format=rss"), `Expected format=rss in ${url}`);
    assert.ok(url.includes("shelf=read"), `Expected shelf=read in ${url}`);
  });

  test("encodes shelf name", () => {
    const url = buildShelfUrl("12345", "currently-reading");
    assert.ok(url.includes("shelf=currently-reading"), `Expected encoded shelf in ${url}`);
  });
});

describe("Goodreads parseShelfXml", () => {
  test("parses shelf RSS into book items", () => {
    const xml = readFileSync(join(fixturesDir, "goodreads-shelf.xml"), "utf-8");
    const books = parseShelfXml(xml);

    assert.strictEqual(books.length, 2);

    const first = books[0];
    assert.strictEqual(first.bookId, "18423");
    assert.strictEqual(first.title, "The Left Hand of Darkness");
    assert.strictEqual(first.author, "Ursula K. Le Guin");
    assert.strictEqual(first.isbn, "0441478123");
    assert.strictEqual(first.rating, 5);
    assert.strictEqual(first.averageRating, "4.18");
    assert.strictEqual(first.yearPublished, "1969");
    assert.strictEqual(first.review, "A masterpiece of science fiction.");
    assert.deepStrictEqual(first.shelves, ["read", "sci-fi"]);
    assert.strictEqual(
      first.coverUrl,
      "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1488213612l/18423.jpg",
    );
    assert.strictEqual(
      first.permalinkUrl,
      "https://www.goodreads.com/review/show/1111111111",
    );
  });

  test("parses dates correctly", () => {
    const xml = readFileSync(join(fixturesDir, "goodreads-shelf.xml"), "utf-8");
    const books = parseShelfXml(xml);

    assert.strictEqual(books[0].started, "2024-03-01T12:00:00.000Z");
    assert.strictEqual(books[0].finished, "2024-03-15T00:00:00.000Z");

    assert.strictEqual(books[1].started, "2024-03-10T08:00:00.000Z");
    assert.strictEqual(books[1].finished, null);
  });

  test("handles unrated books (rating 0)", () => {
    const xml = readFileSync(join(fixturesDir, "goodreads-shelf.xml"), "utf-8");
    const books = parseShelfXml(xml);
    assert.strictEqual(books[1].rating, 0);
  });

  test("handles empty review", () => {
    const xml = readFileSync(join(fixturesDir, "goodreads-shelf.xml"), "utf-8");
    const books = parseShelfXml(xml);
    assert.strictEqual(books[1].review, "");
  });

  test("prefers book_large_image_url over book_image_url", () => {
    const xml = readFileSync(join(fixturesDir, "goodreads-shelf.xml"), "utf-8");
    const books = parseShelfXml(xml);
    assert.ok(!books[0].coverUrl.includes("_SY75_"));
  });

  test("uses earliest date as started when read_at is before pubDate", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Test</title>
  <item>
    <title><![CDATA[Backdated Book]]></title>
    <link>https://www.goodreads.com/review/show/9999</link>
    <book_id>99999</book_id>
    <author_name>Test Author</author_name>
    <user_rating>4</user_rating>
    <user_read_at><![CDATA[Mon, 24 Jul 2023 00:00:00 +0000]]></user_read_at>
    <user_shelves>read</user_shelves>
    <pubDate><![CDATA[Wed, 26 Jul 2023 19:06:00 +0000]]></pubDate>
  </item>
</channel>
</rss>`;
    const books = parseShelfXml(xml);
    assert.strictEqual(books[0].started, "2023-07-24T00:00:00.000Z");
    assert.strictEqual(books[0].finished, "2023-07-26T19:06:00.000Z");
  });

  test("returns empty array for empty channel", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Empty</title></channel></rss>`;
    const books = parseShelfXml(xml);
    assert.deepStrictEqual(books, []);
  });

  // A signed-out request is served the sign-in page with HTTP 200, so the only
  // way to tell it apart from a genuinely empty shelf is the missing feed root.
  // Returning [] here is what let the plugin report "0 books" for months.
  test("throws on the sign-in page served to signed-out requests", () => {
    const html = readFileSync(join(fixturesDir, "goodreads-signin.html"), "utf-8");
    assert.throws(
      () => parseShelfXml(html),
      /not RSS|signed out|sign in/i,
      "Expected the sign-in page to throw, not parse to an empty list",
    );
  });

  test("throws on non-feed content rather than returning no books", () => {
    assert.throws(() => parseShelfXml("<html><body>Page not found</body></html>"), /not RSS/i);
  });
});

describe("Goodreads fetchShelf", () => {
  // Responses recorded from www.goodreads.com on 2026-10-28.
  const signInPage = () => ({
    url: "https://www.goodreads.com/user/sign_in?returnurl=%2Freview%2Flist%2F168273107%3Fshelf%3Dread%26format%3Drss",
    ok: true,
    status: 200,
    body: readFileSync(join(fixturesDir, "goodreads-signin.html"), "utf-8"),
  });

  test("returns books when the feed comes back", async () => {
    const books = await fetchShelf("168273107", "read", async (url) => ({
      url,
      ok: true,
      status: 200,
      body: readFileSync(join(fixturesDir, "goodreads-shelf.xml"), "utf-8"),
    }));
    assert.strictEqual(books.length, 2);
  });

  test("requests the shelf URL built for the user", async () => {
    let requested = null;
    await fetchShelf("168273107", "currently-reading", async (url) => {
      requested = url;
      return {
        url,
        ok: true,
        status: 200,
        body: readFileSync(join(fixturesDir, "goodreads-shelf.xml"), "utf-8"),
      };
    });
    assert.strictEqual(requested, buildShelfUrl("168273107", "currently-reading"));
  });

  // The signed-out response is a 200 after redirects, so neither the status nor
  // response.ok reveals the problem — only the final URL and the body do.
  test("throws when redirected to sign-in despite HTTP 200", async () => {
    await assert.rejects(
      () => fetchShelf("168273107", "read", async () => signInPage()),
      /Not signed in to Goodreads.*"read"/s,
    );
  });

  test("throws when the body is the sign-in page and the final URL is unavailable", async () => {
    await assert.rejects(
      () => fetchShelf("168273107", "read", async () => ({ ...signInPage(), url: undefined })),
      /signed out/i,
    );
  });

  test("names the shelf when an HTTP error comes back", async () => {
    await assert.rejects(
      () =>
        fetchShelf("168273107", "read", async (url) => ({
          url,
          ok: false,
          status: 404,
          body: "",
        })),
      /Failed to fetch shelf "read": HTTP 404/,
    );
  });
});

describe("Goodreads isSignInUrl", () => {
  test("recognizes the sign-in URL the shelf feed redirects to", () => {
    assert.strictEqual(
      isSignInUrl(
        "https://www.goodreads.com/user/sign_in?returnurl=%2Freview%2Flist%2F168273107%3Fshelf%3Dread%26format%3Drss",
      ),
      true,
    );
  });

  test("does not flag the shelf feed URL itself", () => {
    assert.strictEqual(isSignInUrl(buildShelfUrl("168273107", "read")), false);
  });

  test("tolerates a missing URL", () => {
    assert.strictEqual(isSignInUrl(null), false);
  });
});
