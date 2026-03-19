// ABOUTME: Tests for Goodreads extractor — deduplication and book merging across shelves.
// ABOUTME: Validates that books appearing on multiple shelves get merged correctly.
import { test, describe } from "node:test";
import assert from "node:assert";
import { deduplicateBooks } from "../../../plugins/goodreads/extractor.js";

describe("Goodreads deduplicateBooks", () => {
  test("passes through books with unique IDs unchanged", () => {
    const books = [
      { bookId: "1", title: "Book A", shelves: ["read"], started: "2024-01-01T00:00:00.000Z", finished: "2024-02-01T00:00:00.000Z" },
      { bookId: "2", title: "Book B", shelves: ["read"], started: "2024-03-01T00:00:00.000Z", finished: null },
    ];
    const result = deduplicateBooks(books);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].bookId, "1");
    assert.strictEqual(result[1].bookId, "2");
  });

  test("merges duplicate bookIds — combines shelves", () => {
    const books = [
      { bookId: "1", title: "Book A", shelves: ["currently-reading"], started: "2024-01-15T00:00:00.000Z", finished: null },
      { bookId: "1", title: "Book A", shelves: ["read", "favorites"], started: "2024-02-01T00:00:00.000Z", finished: "2024-03-01T00:00:00.000Z" },
    ];
    const result = deduplicateBooks(books);
    assert.strictEqual(result.length, 1);
    assert.deepStrictEqual(result[0].shelves, ["currently-reading", "read", "favorites"]);
  });

  test("merges duplicate bookIds — keeps earliest started date", () => {
    const books = [
      { bookId: "1", title: "Book A", shelves: ["read"], started: "2024-03-01T00:00:00.000Z", finished: "2024-04-01T00:00:00.000Z" },
      { bookId: "1", title: "Book A", shelves: ["currently-reading"], started: "2024-01-01T00:00:00.000Z", finished: null },
    ];
    const result = deduplicateBooks(books);
    assert.strictEqual(result[0].started, "2024-01-01T00:00:00.000Z");
  });

  test("merges duplicate bookIds — keeps finished date from whichever has it", () => {
    const books = [
      { bookId: "1", title: "Book A", shelves: ["currently-reading"], started: "2024-01-01T00:00:00.000Z", finished: null },
      { bookId: "1", title: "Book A", shelves: ["read"], started: "2024-02-01T00:00:00.000Z", finished: "2024-03-01T00:00:00.000Z" },
    ];
    const result = deduplicateBooks(books);
    assert.strictEqual(result[0].finished, "2024-03-01T00:00:00.000Z");
  });

  test("does not duplicate shelf names when merging", () => {
    const books = [
      { bookId: "1", title: "Book A", shelves: ["read", "sci-fi"], started: "2024-01-01T00:00:00.000Z", finished: null },
      { bookId: "1", title: "Book A", shelves: ["read", "favorites"], started: "2024-02-01T00:00:00.000Z", finished: null },
    ];
    const result = deduplicateBooks(books);
    assert.deepStrictEqual(result[0].shelves, ["read", "sci-fi", "favorites"]);
  });

  test("handles empty input", () => {
    const result = deduplicateBooks([]);
    assert.deepStrictEqual(result, []);
  });

  test("handles books with null started dates", () => {
    const books = [
      { bookId: "1", title: "Book A", shelves: ["read"], started: null, finished: null },
      { bookId: "1", title: "Book A", shelves: ["favorites"], started: "2024-01-01T00:00:00.000Z", finished: null },
    ];
    const result = deduplicateBooks(books);
    assert.strictEqual(result[0].started, "2024-01-01T00:00:00.000Z");
  });
});
