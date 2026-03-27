// ABOUTME: Extracts and parses Google Photos item data from the web UI.
// ABOUTME: Handles detail page scraping, date parsing, and item normalization.

/**
 * Parse a raw scraped item into the normalized format consumed by toAS2.
 * The raw item comes from scraping the Google Photos detail page DOM.
 */
export function parseItem(raw, accountName) {
  let dateTaken = null;
  if (raw.dateTaken) {
    try {
      dateTaken = new Date(raw.dateTaken).toISOString();
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
