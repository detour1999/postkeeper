// ABOUTME: Converts Google Photos item objects into ActivityStreams 2.0 format.
// ABOUTME: Produces Note type with photo/video as attachment, location, and people tags.

export function toAS2(item) {
  const isVideo = item.mediaType === "video";
  const file = isVideo ? "1.mp4" : "1.jpg";
  const attachment = [{
    type: isVideo ? "Video" : "Image",
    mediaType: isVideo ? "video/mp4" : "image/jpeg",
    url: file,
  }];

  const tag = (item.people || []).map((name) => ({
    type: "Person",
    name,
  }));

  const as2 = {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Note",
    id: `google-photos:${item.itemId}`,
    url: item.url,
    published: item.dateTaken,
    attributedTo: {
      type: "Person",
      name: item.accountName,
      url: "https://photos.google.com",
    },
    content: item.description || "",
    attachment,
    tag,
    generator: { type: "Application", name: "Google Photos" },
  };

  if (item.location) {
    as2.location = {
      type: "Place",
      name: item.location.name,
      latitude: item.location.latitude,
      longitude: item.location.longitude,
    };
  }

  return as2;
}
