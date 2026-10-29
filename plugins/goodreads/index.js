// ABOUTME: Goodreads plugin for postkeeper — archives book reading activity via RSS.
// ABOUTME: Goodreads gates shelf feeds behind a login, so requests go through a stored browser session.
import { chromium } from "playwright";
import { join } from "node:path";
import { existsSync, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { fetchShelf } from "./fetcher.js";
import { findMissingCookies } from "./session.js";
import { deduplicateBooks } from "./extractor.js";
import { toAS2 } from "./as2.js";

const DEFAULT_SHELVES = ["read", "currently-reading"];
const GOODREADS_URL = "https://www.goodreads.com/";

let browserContext = null;

function profileDir(context) {
  return join(context.dataDir, "browser-profile");
}

/**
 * Adapt Playwright's APIResponse to the shape fetchShelf expects. Requests made
 * through a browser context carry that context's cookies, which is what gets
 * the shelf feed instead of the sign-in page.
 */
function shelfFetcher(browserCtx) {
  return async (url) => {
    const response = await browserCtx.request.get(url);
    return {
      url: response.url(),
      ok: response.ok(),
      status: response.status(),
      body: await response.text(),
    };
  };
}

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

    context.log("Opening browser for Goodreads login...");
    context.log(`Browser profile will be saved to: ${profileDir(context)}`);

    const browserCtx = await chromium.launchPersistentContext(profileDir(context), {
      headless: false,
      viewport: { width: 1280, height: 900 },
    });

    const page = browserCtx.pages()[0] || await browserCtx.newPage();
    await page.goto(GOODREADS_URL);

    context.log("Log in to Goodreads in the browser window.");
    context.log("When you're done, close the browser window.");

    await new Promise((resolve) => {
      browserCtx.on("close", resolve);
    });

    context.log("Session saved.");

    if (context.saveConfig) {
      context.saveConfig({ user_id: userId });
    }

    const shelves = config.shelves || DEFAULT_SHELVES;
    const probeCtx = await chromium.launchPersistentContext(profileDir(context), { headless: true });
    try {
      const getShelfPage = shelfFetcher(probeCtx);
      for (const shelf of shelves) {
        try {
          const books = await fetchShelf(userId, shelf, getShelfPage);
          context.log(`  ${shelf}: ${books.length} book(s) accessible`);
        } catch (err) {
          context.log(`  ${shelf}: ${err.message}`);
        }
      }
    } finally {
      await probeCtx.close();
    }

    context.log("Setup complete. Run: postkeeper run goodreads");
  },

  async status(config, context) {
    if (!config.user_id) {
      return { ok: false, message: "No user_id configured. Run: postkeeper init goodreads" };
    }
    if (!existsSync(profileDir(context))) {
      return { ok: false, message: "No browser profile found. Run: postkeeper init goodreads" };
    }

    const shelf = (config.shelves || DEFAULT_SHELVES)[0];
    let browserCtx;
    try {
      browserCtx = await chromium.launchPersistentContext(profileDir(context), { headless: true });
      // Fetching a shelf is the same work run() does, so it answers the only
      // question that matters: does the stored session still get a feed?
      const books = await fetchShelf(config.user_id, shelf, shelfFetcher(browserCtx));
      return { ok: true, message: `Session valid — ${shelf}: ${books.length} book(s)` };
    } catch (err) {
      return { ok: false, message: err.message };
    } finally {
      if (browserCtx) await browserCtx.close().catch(() => {});
    }
  },

  /**
   * Install a session captured elsewhere — an agent can log in with its own
   * browser and hand the cookies over instead of driving a window here.
   */
  async setSession(cookies, config, context) {
    const dir = profileDir(context);

    const writeCtx = await chromium.launchPersistentContext(dir, { headless: true });
    try {
      await writeCtx.addCookies(cookies);
    } finally {
      await writeCtx.close();
    }

    // Cookies only reach disk when the context closes, and Chrome never writes
    // session cookies at all. Reopening is the only way to see what actually
    // survived — without this, handing over a session cookie reports success
    // and stores nothing.
    const readCtx = await chromium.launchPersistentContext(dir, { headless: true });
    let stored;
    try {
      stored = await readCtx.cookies();
    } finally {
      await readCtx.close();
    }

    const missing = findMissingCookies(cookies, stored);
    if (missing.length > 0) {
      const names = missing.map((c) => c.name).join(", ");
      const sessionOnly = missing.every((c) => c.expires <= 0);
      throw new Error(
        `${missing.length} of ${cookies.length} cookie(s) did not persist: ${names}.` +
          (sessionOnly
            ? " Cookies with no expiry are session cookies, which Chrome does not store on disk."
              + " Re-export them with an expiry, or log in with: postkeeper init goodreads"
            : ""),
      );
    }

    context.log(`Stored ${cookies.length} cookie(s) in ${dir}`);
  },

  async run(config, context) {
    const userId = config.user_id;
    if (!userId) {
      context.log("No user_id configured. Run: postkeeper init goodreads");
      return { posts: [] };
    }
    const shelves = config.shelves || DEFAULT_SHELVES;
    let allBooks = [];

    browserContext = await chromium.launchPersistentContext(profileDir(context), { headless: true });
    const getShelfPage = shelfFetcher(browserContext);

    try {
      for (const shelf of shelves) {
        context.log(`Fetching shelf: ${shelf}...`);
        try {
          const books = await fetchShelf(userId, shelf, getShelfPage);
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
    } finally {
      await browserContext.close();
      browserContext = null;
    }
  },

  async shutdown() {
    if (browserContext) {
      await browserContext.close();
      browserContext = null;
    }
  },
};
