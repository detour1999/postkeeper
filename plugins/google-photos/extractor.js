// ABOUTME: Extracts and parses Google Photos item data from the web UI.
// ABOUTME: Handles grid scrolling, detail page scraping, date parsing, and item normalization.

/**
 * Parse a raw scraped item into the normalized format consumed by toAS2.
 * The raw item comes from scraping the Google Photos detail page DOM.
 */
export function parseItem(raw, accountName) {
  let dateTaken = null;
  if (raw.dateTaken) {
    try {
      let dateStr = raw.dateTaken;
      // Google Photos omits the year for current-year dates.
      // Formats seen: "Mar 27, 9:49 AM" or "Mar 28, Sat, 9:27 PM"
      // Strip day-of-week if present, then insert year if missing.
      dateStr = dateStr.replace(/,\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/, ",");
      if (!/\d{4}/.test(dateStr)) {
        dateStr = dateStr.replace(/^(\w+ \d+),/, `$1, ${new Date().getFullYear()},`);
      }
      let parsed = new Date(dateStr);
      // If the result is in the future, the year was likely wrong (e.g. "Dec 31"
      // parsed as current year when we're now in January of the next year).
      if (parsed > new Date()) {
        parsed = new Date(parsed.setFullYear(parsed.getFullYear() - 1));
      }
      if (!isNaN(parsed.getTime())) {
        dateTaken = parsed.toISOString();
      }
    } catch {
      dateTaken = null;
    }
  }

  return {
    itemId: raw.itemId,
    url: `https://photos.google.com/photo/${raw.itemId}`,
    dateTaken,
    description: raw.description || "",
    filename: raw.filename || "",
    mediaType: raw.mediaType || "image",
    mediaUrl: raw.mediaUrl || "",
    location: raw.location || null,
    people: raw.people || [],
    camera: raw.camera || null,
    resolution: raw.resolution || null,
    fileSize: raw.fileSize || "",
    accountName,
  };
}

/* c8 ignore start -- browser-dependent functions, tested manually */

/**
 * Extract the item ID from a Google Photos URL.
 * e.g. "https://photos.google.com/photo/AF1QipXXX" -> "AF1QipXXX"
 */
function extractItemId(url) {
  const match = url.match(/\/photo\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Scrape the logged-in user's account name from the Google Photos page.
 */
export async function scrapeAccountName(page) {
  const label = await page.getAttribute(
    'a[aria-label^="Google Account:"]',
    "aria-label",
  );
  if (label) {
    // "Google Account: Jane Doe  \n(jane@example.com)" -> "Jane Doe"
    const match = label.match(/Google Account:\s*(.+?)(?:\s*\n|\s*\()/);
    if (match) return match[1].trim();
  }
  return "Google Photos User";
}

/**
 * Scrape an aria-label value from the first matching selector, stripping the prefix.
 * e.g. ariaValue(page, 'div[aria-label^="Filename:"]', "Filename: ") -> "IMG_1234.jpg"
 */
async function ariaValue(page, selector, prefix) {
  const el = await page.$(selector);
  if (!el) return null;
  const label = await el.getAttribute("aria-label");
  if (!label) return null;
  return label.replace(prefix, "").trim();
}

/**
 * Scroll the Google Photos library grid to discover item IDs.
 * Returns an array of item IDs found during scrolling.
 * Stops when it encounters an ID already in archivedIds, or runs out of content.
 */
export async function scrollLibrary(page, archivedIds, log = () => {}) {
  await page.goto("https://photos.google.com/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const discoveredIds = [];
  const seen = new Set();
  let noNewItems = 0;

  while (noNewItems < 5) {
    // Collect photo links from the current DOM
    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a[href*="/photo/"]');
      return Array.from(anchors).map((a) => a.href);
    });

    let foundNew = false;
    for (const link of links) {
      const id = extractItemId(link);
      if (!id || seen.has(id)) continue;
      seen.add(id);

      // Stop if we hit an already-archived item
      if (archivedIds.has(`google-photos:${id}`)) {
        log(`Hit archived item ${id} — stopping scroll`);
        return discoveredIds;
      }

      discoveredIds.push(id);
      foundNew = true;
    }

    if (foundNew) {
      noNewItems = 0;
      log(`Discovered ${discoveredIds.length} items so far...`);
    } else {
      noNewItems++;
    }

    // Scroll down
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500 + Math.random() * 1000);
  }

  log(`Scroll complete — ${discoveredIds.length} total items discovered`);
  return discoveredIds;
}

/**
 * Navigate to a photo/video detail page and scrape all metadata.
 * Returns a raw item object for parseItem().
 */
export async function fetchItemDetails(page, itemId, log = () => {}) {
  await page.goto(`https://photos.google.com/photo/${itemId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  // Open info panel
  const infoBtn = await page.$('button[aria-label="Open info"]');
  if (infoBtn) {
    await infoBtn.click();
    await page.waitForTimeout(1000);
  }

  // Date — combine date, time, and timezone aria-labels
  const dateLabel = await ariaValue(page, 'div[aria-label^="Date taken:"]', "Date taken: ");
  const timeLabel = await ariaValue(page, 'span[aria-label^="Time taken:"]', "Time taken: ");
  const tzLabel = await ariaValue(page, 'span[aria-label^="GMT"]', "");
  let dateTaken = null;
  if (dateLabel && timeLabel) {
    // timeLabel is like "Today, 9:49 AM" or "Mar 15, 2024, 2:30 PM"
    // dateLabel is like "Mar 27" or "Mar 27, 2024"
    // Try combining them into a parseable string
    const timeWithoutRelative = timeLabel.replace(/^Today,?\s*/, "").replace(/^Yesterday,?\s*/, "");
    const dateStr = `${dateLabel}, ${timeWithoutRelative}`;
    dateTaken = dateStr;
  }

  // Description
  const descEl = await page.$('textarea[aria-label="Description"]');
  const description = descEl ? await descEl.inputValue() : "";

  // Filename
  const filename = await ariaValue(page, 'div[aria-label^="Filename:"]', "Filename: ");

  // Determine media type from filename
  const videoExts = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"];
  const isVideo = filename && videoExts.some((ext) => filename.toLowerCase().endsWith(ext));

  // Camera info
  const cameraName = await ariaValue(page, 'div[aria-label^="Camera name:"]', "Camera name: ");
  const aperture = await ariaValue(page, 'span[aria-label^="Aperture:"]', "Aperture: ");
  const exposure = await ariaValue(page, 'span[aria-label^="Exposure time:"]', "Exposure time: ");
  const focalLength = await ariaValue(page, 'span[aria-label^="Focal length:"]', "Focal length: ");

  // ISO — shown as text like "ISO426", not in an aria-label
  const isoText = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = node.textContent.trim();
      if (/^ISO\d+$/.test(text)) return text;
    }
    return null;
  });

  const camera = cameraName
    ? { model: cameraName, aperture, exposure, focalLength, iso: isoText }
    : null;

  // Resolution
  const sizeLabel = await ariaValue(page, 'span[aria-label^="Size:"]', "Size: ");
  let resolution = null;
  if (sizeLabel) {
    const match = sizeLabel.match(/(\d+)\s*×\s*(\d+)/);
    if (match) {
      resolution = { width: parseInt(match[1]), height: parseInt(match[2]) };
    }
  }

  // File size
  const fileSize = await ariaValue(page, 'span[aria-label^="File size:"]', "File size: ");

  // People — look for "Photo of X" links in the info panel
  const people = await page.evaluate(() => {
    const links = document.querySelectorAll('a[aria-label^="Photo of"]');
    return Array.from(links).map((a) => {
      const label = a.getAttribute("aria-label");
      return label.replace("Photo of ", "").trim();
    });
  });
  // Deduplicate (detail page can show duplicates for adjacent photos)
  const uniquePeople = [...new Set(people)];

  // Location — text near "Edit location" button
  const location = await page.evaluate(() => {
    const editLoc = document.querySelector('div[aria-label="Edit location"]');
    if (!editLoc) return null;
    // The location name is typically a sibling or nearby text node
    const parent = editLoc.closest("div");
    if (!parent) return null;
    const textNodes = parent.querySelectorAll("span, div");
    for (const node of textNodes) {
      const text = node.textContent.trim();
      // Skip "Edit location" itself and empty text
      if (text && text !== "Edit location" && text.length > 1 && !text.includes("Edit")) {
        return { name: text };
      }
    }
    return null;
  });

  // Media URL — grab the main image src for reference (download uses Shift+D)
  const mediaUrl = await page.evaluate(() => {
    const imgs = document.querySelectorAll("img");
    for (const img of imgs) {
      if (img.src && img.src.includes("photos.fife.usercontent.google.com") && (img.naturalWidth > 200 || img.width > 200)) {
        return img.src;
      }
    }
    return null;
  });

  return {
    itemId,
    dateTaken,
    description,
    filename,
    mediaType: isVideo ? "video" : "image",
    mediaUrl,
    location,
    people: uniquePeople,
    camera,
    resolution,
    fileSize,
  };
}

/**
 * Download original-quality media using the Shift+D keyboard shortcut.
 * Returns the download URL and suggested filename.
 */
export async function downloadOriginal(page, itemId) {
  // Make sure we're on the detail page
  const currentUrl = page.url();
  if (!currentUrl.includes(`/photo/${itemId}`)) {
    await page.goto(`https://photos.google.com/photo/${itemId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);
  }

  const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
  await page.keyboard.press("Shift+d");
  const download = await downloadPromise;

  return {
    download,
    filename: download.suggestedFilename(),
    url: download.url(),
  };
}

/* c8 ignore stop */
