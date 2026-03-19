// ABOUTME: Tests for the Goodreads AS2 converter.
// ABOUTME: Validates conversion of book objects to ActivityStreams 2.0 format.
import { test, describe } from "node:test";
import assert from "node:assert";
import { toAS2 } from "../../../plugins/goodreads/as2.js";

function makeBook(overrides = {}) {
  return {
    bookId: "18423",
    title: "The Left Hand of Darkness",
    author: "Ursula K. Le Guin",
    isbn: "0441478123",
    rating: 5,
    averageRating: "4.18",
    yearPublished: "1969",
    review: "A masterpiece of science fiction.",
    shelves: ["read", "sci-fi"],
    coverUrl:
      "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1488213612l/18423.jpg",
    permalinkUrl: "https://www.goodreads.com/review/show/1111111111",
    started: "2024-03-01T12:00:00.000Z",
    finished: "2024-03-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("Goodreads toAS2", () => {
  test("converts a rated book to AS2", () => {
    const as2 = toAS2(makeBook());
    assert.strictEqual(as2["@context"], "https://www.w3.org/ns/activitystreams");
    assert.strictEqual(as2.type, "Note");
    assert.strictEqual(as2.id, "goodreads:book:18423");
    assert.strictEqual(
      as2.url,
      "https://www.goodreads.com/review/show/1111111111",
    );
    assert.strictEqual(as2.published, "2024-03-01T12:00:00.000Z");
    assert.strictEqual(
      as2.content,
      "★★★★★ - The Left Hand of Darkness by Ursula K. Le Guin",
    );
    assert.strictEqual(as2.attributedTo.name, "Ursula K. Le Guin");
    assert.strictEqual(as2.generator.name, "Goodreads");
  });

  test("includes cover image as attachment", () => {
    const as2 = toAS2(makeBook());
    assert.strictEqual(as2.attachment.length, 1);
    assert.strictEqual(as2.attachment[0].type, "Image");
    assert.strictEqual(as2.attachment[0].mediaType, "image/jpeg");
    assert.strictEqual(as2.attachment[0].url, "cover.jpg");
  });

  test("includes book metadata in ext:book", () => {
    const as2 = toAS2(makeBook());
    const ext = as2["ext:book"];
    assert.strictEqual(ext.title, "The Left Hand of Darkness");
    assert.strictEqual(ext.author, "Ursula K. Le Guin");
    assert.strictEqual(ext.isbn, "0441478123");
    assert.strictEqual(ext.rating, 5);
    assert.strictEqual(ext.averageRating, "4.18");
    assert.strictEqual(ext.yearPublished, "1969");
    assert.strictEqual(ext.review, "A masterpiece of science fiction.");
    assert.deepStrictEqual(ext.shelves, ["read", "sci-fi"]);
    assert.strictEqual(ext.started, "2024-03-01T12:00:00.000Z");
    assert.strictEqual(ext.finished, "2024-03-15T00:00:00.000Z");
  });

  test("uses started date as AS2 published", () => {
    const as2 = toAS2(makeBook());
    assert.strictEqual(as2.published, "2024-03-01T12:00:00.000Z");
  });

  test("handles unrated book (rating 0)", () => {
    const as2 = toAS2(makeBook({ rating: 0 }));
    assert.strictEqual(
      as2.content,
      "The Left Hand of Darkness by Ursula K. Le Guin",
    );
    assert.strictEqual(as2["ext:book"].rating, 0);
  });

  test("handles book with no finished date", () => {
    const as2 = toAS2(makeBook({ finished: null }));
    assert.strictEqual(as2["ext:book"].finished, null);
  });

  test("handles book with no cover URL", () => {
    const as2 = toAS2(makeBook({ coverUrl: "" }));
    assert.strictEqual(as2.attachment.length, 0);
  });

  test("handles null started date", () => {
    const as2 = toAS2(makeBook({ started: null }));
    assert.strictEqual(as2.published, null);
  });
});
