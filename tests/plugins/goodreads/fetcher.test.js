// ABOUTME: Tests for Goodreads RSS fetcher — XML parsing of shelf feeds.
// ABOUTME: Uses fixture XML to verify book field extraction and edge cases.
import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseShelfXml } from "../../../plugins/goodreads/fetcher.js";

const fixturesDir = join(import.meta.dirname, "../../fixtures");

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

  test("returns empty array for empty channel", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Empty</title></channel></rss>`;
    const books = parseShelfXml(xml);
    assert.deepStrictEqual(books, []);
  });
});
