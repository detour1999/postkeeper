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

    for (const shelf of book.shelves) {
      if (!existing.shelves.includes(shelf)) {
        existing.shelves.push(shelf);
      }
    }

    if (book.started && (!existing.started || book.started < existing.started)) {
      existing.started = book.started;
    }

    if (book.finished && !existing.finished) {
      existing.finished = book.finished;
    }
  }

  return [...byId.values()];
}
