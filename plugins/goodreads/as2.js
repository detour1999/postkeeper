// ABOUTME: Converts Goodreads book objects into ActivityStreams 2.0 format.
// ABOUTME: Produces Note type with book metadata in ext:book extension field.

function starRating(rating) {
  if (rating === 0) return "";
  return "\u2605".repeat(rating) + "\u2606".repeat(5 - rating);
}

export function toAS2(book, userId) {
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
      name: userId,
      url: `https://www.goodreads.com/user/show/${userId}`,
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
