# Goodreads Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Archive book reading activity from Goodreads using public RSS feeds.

**Architecture:** Pure RSS fetch — no browser, no auth. Fetches shelf RSS feeds, parses XML with `fast-xml-parser`, deduplicates books across shelves, downloads cover images, converts to AS2.

**Tech Stack:** Node built-ins (`fetch`, `node:fs`, `node:path`), `fast-xml-parser` (same dep as RSS plugin)

**Design doc:** `docs/plans/2026-03-16-goodreads-plugin-design.md`

---

### Task 1: Scaffold plugin and install dependency

**Files:**
- Modify: `plugins/goodreads/package.json`
- Delete: `plugins/goodreads/index.js` (will be rewritten in Task 5)

**Step 1: Update package.json — replace playwright with fast-xml-parser**

```json
{
  "name": "postkeeper-plugin-goodreads",
  "type": "module",
  "private": true,
  "dependencies": {
    "fast-xml-parser": "^5.2.0"
  }
}
```

**Step 2: Install dependencies**

Run: `cd plugins/goodreads && npm install`

**Step 3: Remove the old Playwright-based index.js**

Delete `plugins/goodreads/index.js` — it will be rewritten from scratch in Task 5 after we build the supporting modules.

**Step 4: Commit**

```bash
git add plugins/goodreads/package.json plugins/goodreads/package-lock.json
git rm plugins/goodreads/index.js
git commit -m "chore(goodreads): swap playwright for fast-xml-parser"
```

---

### Task 2: Fetcher — RSS fetch and XML parsing (TDD)

**Files:**
- Create: `tests/plugins/goodreads/fetcher.test.js`
- Create: `plugins/goodreads/fetcher.js`
- Create: `tests/fixtures/goodreads-shelf.xml`

The fetcher does two things: (1) fetch RSS XML from a URL, and (2) parse XML into raw book item objects. We test the parsing with fixture XML; the fetch is a thin wrapper around `fetch()`.

**Step 1: Create a Goodreads RSS fixture file**

Create `tests/fixtures/goodreads-shelf.xml` with a realistic Goodreads RSS structure. Goodreads RSS items use custom namespaces for book fields. Here's the structure:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>Dylan's bookshelf: read</title>
  <link>https://www.goodreads.com/review/list_rss/12345678?shelf=read</link>
  <item>
    <title><![CDATA[The Left Hand of Darkness]]></title>
    <link>https://www.goodreads.com/review/show/1111111111</link>
    <book_id>18423</book_id>
    <book_image_url>https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1488213612l/18423._SY75_.jpg</book_image_url>
    <book_large_image_url>https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1488213612l/18423.jpg</book_large_image_url>
    <author_name>Ursula K. Le Guin</author_name>
    <isbn>0441478123</isbn>
    <user_rating>5</user_rating>
    <user_read_at><![CDATA[Sat, 15 Mar 2024 00:00:00 +0000]]></user_read_at>
    <user_review><![CDATA[A masterpiece of science fiction.]]></user_review>
    <average_rating>4.18</average_rating>
    <book_published>1969</book_published>
    <user_shelves>read, sci-fi</user_shelves>
    <pubDate><![CDATA[Fri, 01 Mar 2024 12:00:00 +0000]]></pubDate>
  </item>
  <item>
    <title><![CDATA[Dune]]></title>
    <link>https://www.goodreads.com/review/show/2222222222</link>
    <book_id>234225</book_id>
    <book_image_url>https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1555447414l/234225._SY75_.jpg</book_image_url>
    <book_large_image_url>https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1555447414l/234225.jpg</book_large_image_url>
    <author_name>Frank Herbert</author_name>
    <isbn>0441172717</isbn>
    <user_rating>0</user_rating>
    <user_read_at><![CDATA[]]></user_read_at>
    <user_review><![CDATA[]]></user_review>
    <average_rating>4.27</average_rating>
    <book_published>1965</book_published>
    <user_shelves>currently-reading</user_shelves>
    <pubDate><![CDATA[Tue, 10 Mar 2024 08:00:00 +0000]]></pubDate>
  </item>
</channel>
</rss>
```

Note: The second item has no `user_read_at` and `user_rating` of 0 (unrated) — this represents a currently-reading book.

**Step 2: Write failing tests**

Create `tests/plugins/goodreads/fetcher.test.js`:

```js
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
    assert.strictEqual(first.coverUrl, "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1488213612l/18423.jpg");
    assert.strictEqual(first.permalinkUrl, "https://www.goodreads.com/review/show/1111111111");
  });

  test("parses dates correctly", () => {
    const xml = readFileSync(join(fixturesDir, "goodreads-shelf.xml"), "utf-8");
    const books = parseShelfXml(xml);

    // First book: has both pubDate and user_read_at
    assert.strictEqual(books[0].started, "2024-03-01T12:00:00.000Z");
    assert.strictEqual(books[0].finished, "2024-03-15T00:00:00.000Z");

    // Second book: has pubDate but no user_read_at
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

    // Should use the large image URL (no _SY75_ sizing)
    assert.ok(!books[0].coverUrl.includes("_SY75_"));
  });

  test("returns empty array for empty channel", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Empty</title></channel></rss>`;
    const books = parseShelfXml(xml);
    assert.deepStrictEqual(books, []);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `node --test tests/plugins/goodreads/fetcher.test.js`
Expected: FAIL — module not found

**Step 4: Implement fetcher.js**

Create `plugins/goodreads/fetcher.js`:

```js
// ABOUTME: Fetches and parses Goodreads RSS shelf feeds into book objects.
// ABOUTME: Uses fast-xml-parser to handle CDATA sections and custom Goodreads fields.
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "item",
});

function parseItem(item) {
  const title = item.title || "";
  const bookId = String(item.book_id || "");
  const author = item.author_name || "";
  const isbn = item.isbn || "";
  const rating = parseInt(item.user_rating, 10) || 0;
  const averageRating = item.average_rating || "";
  const yearPublished = item.book_published ? String(item.book_published) : "";
  const review = item.user_review || "";
  const permalinkUrl = item.link || "";

  // Prefer large image, fall back to standard
  const coverUrl = item.book_large_image_url || item.book_image_url || "";

  // Parse shelves from comma-separated string
  const shelvesRaw = item.user_shelves || "";
  const shelves = shelvesRaw ? shelvesRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];

  // Dates
  const pubDateRaw = item.pubDate || "";
  const started = pubDateRaw ? new Date(pubDateRaw).toISOString() : null;

  const readAtRaw = item.user_read_at || "";
  const finished = readAtRaw ? new Date(readAtRaw).toISOString() : null;

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
    throw new Error(`Failed to fetch shelf "${shelf}": HTTP ${response.status}`);
  }
  const xml = await response.text();
  return parseShelfXml(xml);
}
```

**Step 5: Run tests to verify they pass**

Run: `node --test tests/plugins/goodreads/fetcher.test.js`
Expected: All 6 tests PASS

**Step 6: Commit**

```bash
git add tests/fixtures/goodreads-shelf.xml tests/plugins/goodreads/fetcher.test.js plugins/goodreads/fetcher.js
git commit -m "feat(goodreads): add RSS fetcher with XML parsing"
```

---

### Task 3: Extractor — deduplication and book merging (TDD)

**Files:**
- Create: `tests/plugins/goodreads/extractor.test.js`
- Create: `plugins/goodreads/extractor.js`

The extractor takes arrays of book items from multiple shelves and deduplicates by `bookId`, merging shelf lists and keeping the earliest `started` date.

**Step 1: Write failing tests**

Create `tests/plugins/goodreads/extractor.test.js`:

```js
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
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/plugins/goodreads/extractor.test.js`
Expected: FAIL — module not found

**Step 3: Implement extractor.js**

Create `plugins/goodreads/extractor.js`:

```js
// ABOUTME: Deduplicates books across multiple Goodreads shelves.
// ABOUTME: Merges shelf lists, keeps earliest started date and any finished date.
export function deduplicateBooks(books) {
  const byId = new Map();

  for (const book of books) {
    const existing = byId.get(book.bookId);
    if (!existing) {
      byId.set(book.bookId, { ...book, shelves: [...book.shelves] });
      continue;
    }

    // Merge shelves (no duplicates)
    for (const shelf of book.shelves) {
      if (!existing.shelves.includes(shelf)) {
        existing.shelves.push(shelf);
      }
    }

    // Keep earliest started
    if (book.started && (!existing.started || book.started < existing.started)) {
      existing.started = book.started;
    }

    // Keep finished if either has it
    if (book.finished && !existing.finished) {
      existing.finished = book.finished;
    }
  }

  return [...byId.values()];
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/plugins/goodreads/extractor.test.js`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add tests/plugins/goodreads/extractor.test.js plugins/goodreads/extractor.js
git commit -m "feat(goodreads): add book deduplication across shelves"
```

---

### Task 4: AS2 converter (TDD)

**Files:**
- Create: `tests/plugins/goodreads/as2.test.js`
- Create: `plugins/goodreads/as2.js`

Converts a book object into AS2 format. Follows the pattern from `plugins/facebook/as2.js`.

**Step 1: Write failing tests**

Create `tests/plugins/goodreads/as2.test.js`:

```js
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
    coverUrl: "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1488213612l/18423.jpg",
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
    assert.strictEqual(as2.url, "https://www.goodreads.com/review/show/1111111111");
    assert.strictEqual(as2.published, "2024-03-01T12:00:00.000Z");
    assert.strictEqual(as2.content, "★★★★★ - The Left Hand of Darkness by Ursula K. Le Guin");
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
    assert.strictEqual(as2.content, "The Left Hand of Darkness by Ursula K. Le Guin");
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
```

**Step 2: Run tests to verify they fail**

Run: `node --test tests/plugins/goodreads/as2.test.js`
Expected: FAIL — module not found

**Step 3: Implement as2.js**

Create `plugins/goodreads/as2.js`:

```js
// ABOUTME: Converts Goodreads book objects into ActivityStreams 2.0 format.
// ABOUTME: Produces Note type with book metadata in ext:book extension field.

function starRating(rating) {
  if (rating === 0) return "";
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

export function toAS2(book) {
  const ratingStr = starRating(book.rating);
  const content = ratingStr
    ? `${ratingStr} - ${book.title} by ${book.author}`
    : `${book.title} by ${book.author}`;

  const attachment = [];
  if (book.coverUrl) {
    attachment.push({
      type: "Image",
      mediaType: "image/jpeg",
      url: "cover.jpg",
    });
  }

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Note",
    id: `goodreads:book:${book.bookId}`,
    url: book.permalinkUrl,
    published: book.started,
    attributedTo: {
      type: "Person",
      name: book.author,
    },
    content,
    attachment,
    generator: { type: "Application", name: "Goodreads" },
    "ext:book": {
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      rating: book.rating,
      averageRating: book.averageRating,
      yearPublished: book.yearPublished,
      review: book.review,
      shelves: book.shelves,
      started: book.started,
      finished: book.finished,
    },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test tests/plugins/goodreads/as2.test.js`
Expected: All 8 tests PASS

**Step 5: Commit**

```bash
git add tests/plugins/goodreads/as2.test.js plugins/goodreads/as2.js
git commit -m "feat(goodreads): add AS2 converter for book objects"
```

---

### Task 5: Plugin interface — index.js

**Files:**
- Create: `plugins/goodreads/index.js`

This wires up init, status, and run. The `run` method fetches all configured shelves, deduplicates, downloads covers, and returns posts. No unit test for this file — it orchestrates the tested modules and does I/O. Manual testing in Task 7.

**Step 1: Create index.js**

```js
// ABOUTME: Goodreads plugin for postkeeper — archives book reading activity via RSS.
// ABOUTME: Fetches public RSS feeds for configured shelves, no authentication needed.
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { fetchShelf } from "./fetcher.js";
import { deduplicateBooks } from "./extractor.js";
import { toAS2 } from "./as2.js";

const DEFAULT_SHELVES = ["read", "currently-reading"];

export default {
  name: "goodreads",
  description: "Goodreads book archiver",

  async init(config, context) {
    const userId = config.user_id;
    if (!userId) {
      context.log("No user_id configured. Add your Goodreads user ID to config.json under plugins.goodreads.user_id");
      context.log("Find it at: https://www.goodreads.com → My Books → look at the URL for your numeric ID");
      return;
    }

    const shelves = config.shelves || DEFAULT_SHELVES;
    context.log(`Checking RSS access for user ${userId}...`);

    for (const shelf of shelves) {
      try {
        const books = await fetchShelf(userId, shelf);
        context.log(`  ${shelf}: ${books.length} book(s) accessible`);
      } catch (err) {
        context.log(`  ${shelf}: ${err.message}`);
      }
    }

    context.log("Setup complete. Run: postkeeper run goodreads");
  },

  async status(config) {
    if (!config.user_id) {
      return { ok: false, message: "No user_id configured" };
    }
    return { ok: true, message: `User ID: ${config.user_id}` };
  },

  async run(config, context) {
    const userId = config.user_id;
    const shelves = config.shelves || DEFAULT_SHELVES;
    let allBooks = [];

    for (const shelf of shelves) {
      context.log(`Fetching shelf: ${shelf}...`);
      try {
        const books = await fetchShelf(userId, shelf);
        context.log(`  Found ${books.length} book(s)`);
        allBooks = allBooks.concat(books);
      } catch (err) {
        context.log(`  Error: ${err.message}`);
      }
    }

    const books = deduplicateBooks(allBooks);
    context.log(`${books.length} unique book(s) after deduplication`);

    // Filter out already-archived books
    const newBooks = books.filter((b) => !context.archivedIds.has(`goodreads:book:${b.bookId}`));
    if (newBooks.length === 0) {
      context.log("No new books.");
      return { posts: [] };
    }

    context.log(`${newBooks.length} new book(s) to archive`);
    const posts = [];

    for (const book of newBooks) {
      const as2 = toAS2(book);
      const mediaFiles = [];

      // Download cover image
      if (book.coverUrl) {
        try {
          const coverPath = join(context.tmpDir, `${book.bookId}-cover.jpg`);
          const response = await fetch(book.coverUrl);
          if (response.ok) {
            const fileStream = createWriteStream(coverPath);
            await pipeline(response.body, fileStream);
            mediaFiles.push({ relativePath: "cover.jpg", tmpPath: coverPath });
            context.log(`  Downloaded cover for "${book.title}"`);
          } else {
            context.log(`  Failed to download cover for "${book.title}": HTTP ${response.status}`);
          }
        } catch (err) {
          context.log(`  Failed to download cover for "${book.title}": ${err.message}`);
        }
      }

      posts.push({ as2, raw: book, media: mediaFiles });
    }

    return { posts };
  },
};
```

**Step 2: Commit**

```bash
git add plugins/goodreads/index.js
git commit -m "feat(goodreads): add plugin interface — init, status, run"
```

---

### Task 6: Plugin README

**Files:**
- Create: `plugins/goodreads/README.md`

**Step 1: Create the README**

```markdown
# Goodreads Plugin

Archives your book reading activity from Goodreads using public RSS feeds.

## Setup

1. Find your Goodreads user ID:
   - Go to [goodreads.com](https://www.goodreads.com) and sign in
   - Click "My Books" in the navigation
   - Look at the URL — it will be something like `goodreads.com/review/list/12345678`
   - Your user ID is the number (`12345678`)

2. Add to your config:
   ```json
   {
     "plugins": {
       "goodreads": {
         "user_id": "12345678"
       }
     }
   }
   ```

3. Verify access:
   ```bash
   postkeeper init goodreads
   ```

4. Archive your books:
   ```bash
   postkeeper run goodreads
   ```

## Config

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `user_id` | yes | — | Your Goodreads numeric user ID |
| `shelves` | no | `["read", "currently-reading"]` | Which shelves to archive |

## What Gets Archived

For each book:
- Title, author, ISBN
- Your rating (1-5 stars) and review
- Community average rating
- Publication year
- Cover image (largest available)
- Shelves the book is on
- When you started reading (date added to shelf)
- When you finished reading (if marked as read)

## Limitations

- **~200 books per shelf.** Goodreads RSS feeds are capped at approximately 200 items per shelf. Books beyond this limit are not available via RSS. Run the archiver periodically to capture books before they roll off.
- **Public shelves only.** RSS feeds are public — no authentication is needed, but private shelves are not accessible.
- **"Started" date is approximate.** The start date is derived from when the book was added to the RSS feed, which closely correlates with when you shelved it but isn't exact.
```

**Step 2: Commit**

```bash
git add plugins/goodreads/README.md
git commit -m "docs(goodreads): add plugin README with setup and limitations"
```

---

### Task 7: Run tests and verify coverage

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass, including new goodreads tests

**Step 2: Check coverage**

Run: `npm run test:coverage`
Expected: Coverage stays at or above 90% lines

**Step 3: Fix any issues**

If tests fail or coverage drops, fix before proceeding.

**Step 4: Commit any fixes**

---

### Task 8: Manual E2E test and cleanup

**Step 1: Configure the plugin**

Add goodreads config to `~/.config/postkeeper/config.json` with a real `user_id`.

**Step 2: Run init**

Run: `node src/cli.js init goodreads`
Expected: Shows shelf counts for configured shelves

**Step 3: Run the plugin**

Run: `node src/cli.js run goodreads`
Expected: Fetches books, downloads covers, writes AS2 + raw JSON to archive

**Step 4: Inspect output**

Check `~/.local/share/postkeeper/archive/goodreads/posts/` for:
- `.as2.json` files with correct AS2 structure
- `.raw.json` files with full book data
- `cover.jpg` files in media directories

**Step 5: Clean up exploration scripts**

Delete `scripts/explore-goodreads.js` — it was for initial investigation.

**Step 6: Commit cleanup**

```bash
git rm scripts/explore-goodreads.js
git commit -m "chore: remove goodreads exploration script"
```

---

### Task 9: Push and create PR

**Step 1: Push branch**

Run: `git push -u origin goodreads-plugin`

**Step 2: Create PR**

```bash
gh pr create --title "feat: add Goodreads book archiver plugin" --body "$(cat <<'EOF'
## Summary
- New Goodreads plugin that archives book reading activity via public RSS feeds
- No Playwright or authentication needed — uses `fast-xml-parser` to parse shelf RSS
- Deduplicates books across shelves, downloads cover images
- Introduces per-plugin README convention

## What's included
- `plugins/goodreads/` — fetcher, extractor, AS2 converter, plugin interface, README
- `tests/plugins/goodreads/` — full test coverage for parsing, dedup, AS2 conversion
- Design doc at `docs/plans/2026-03-16-goodreads-plugin-design.md`

## Test plan
- [ ] `npm test` passes
- [ ] `npm run test:coverage` ≥ 90%
- [ ] `postkeeper init goodreads` shows shelf counts
- [ ] `postkeeper run goodreads` archives books with covers

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
