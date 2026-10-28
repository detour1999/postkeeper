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
    let userId = config.user_id;

    if (!userId && context.prompt) {
      const input = await context.prompt("Enter your Goodreads user ID (find it in your Goodreads profile URL):");
      if (!input) {
        context.log("Skipping Goodreads setup.");
        return;
      }
      userId = input;
    }

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

    if (context.saveConfig) {
      context.saveConfig({ user_id: userId });
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
    if (!userId) {
      context.log("No user_id configured. Run: postkeeper init goodreads");
      return { posts: [] };
    }
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
      const as2 = toAS2(book, userId);
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
