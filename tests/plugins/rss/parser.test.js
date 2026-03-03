// tests/plugins/rss/parser.test.js
import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFeed } from "../../../plugins/rss/parser.js";

const fixturesDir = join(import.meta.dirname, "../../fixtures");

describe("parseFeed", () => {
  test("parses RSS feed into AS2 articles", () => {
    const xml = readFileSync(join(fixturesDir, "rss-feed.xml"), "utf-8");
    const articles = parseFeed(xml, "Test Blog");

    assert.strictEqual(articles.length, 2);

    const first = articles[0];
    assert.strictEqual(first["@context"], "https://www.w3.org/ns/activitystreams");
    assert.strictEqual(first.type, "Article");
    assert.strictEqual(first.name, "First Post");
    assert.strictEqual(first.id, "https://example.com/posts/first");
    assert.strictEqual(first.url, "https://example.com/posts/first");
    assert.strictEqual(first.content, "<p>Full content here</p>");
    assert.strictEqual(first.published, "2024-03-15T14:30:00.000Z");
    assert.strictEqual(first.attributedTo.name, "Alice");
    assert.deepStrictEqual(first.tag, [
      { type: "Object", name: "Tech" },
      { type: "Object", name: "Node.js" },
    ]);
    assert.strictEqual(first.attachment.length, 1);
    assert.strictEqual(first.attachment[0].type, "Audio");
    assert.strictEqual(first.attachment[0].mediaType, "audio/mpeg");
    assert.strictEqual(first.attachment[0].url, "https://example.com/audio.mp3");

    const second = articles[1];
    assert.strictEqual(second.name, "Second Post");
    assert.strictEqual(second.content, "Another post");
    assert.strictEqual(second.attributedTo.name, "Bob");
    assert.deepStrictEqual(second.attachment, []);
  });

  test("parses Atom feed into AS2 articles", () => {
    const xml = readFileSync(join(fixturesDir, "atom-feed.xml"), "utf-8");
    const articles = parseFeed(xml, "Atom Blog");

    assert.strictEqual(articles.length, 1);

    const entry = articles[0];
    assert.strictEqual(entry.type, "Article");
    assert.strictEqual(entry.name, "Atom Entry");
    assert.strictEqual(entry.id, "https://atom.example.com/entries/1");
    assert.strictEqual(entry.content, "<p>Atom content</p>");
    assert.strictEqual(entry.published, "2024-03-15T14:30:00.000Z");
    assert.strictEqual(entry.attributedTo.name, "Charlie");
    assert.deepStrictEqual(entry.tag, [{ type: "Object", name: "Atom" }]);
    assert.strictEqual(entry.generator.name, "Atom Blog");
  });

  test("falls back to description when content:encoded is missing", () => {
    const xml = readFileSync(join(fixturesDir, "rss-feed.xml"), "utf-8");
    const articles = parseFeed(xml, "Test");
    // Second item has no content:encoded, should use description
    assert.strictEqual(articles[1].content, "Another post");
  });

  test("maps video and image enclosure types correctly", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Media Blog</title>
    <item>
      <title>Media Post</title>
      <link>https://example.com/media</link>
      <description>Has media</description>
      <pubDate>Sat, 15 Mar 2024 14:30:00 GMT</pubDate>
      <enclosure url="https://example.com/video.mp4" type="video/mp4" />
      <enclosure url="https://example.com/photo.jpg" type="image/jpeg" />
      <enclosure url="https://example.com/file.pdf" type="application/pdf" />
    </item>
  </channel>
</rss>`;
    const articles = parseFeed(xml, "Media Blog");
    assert.strictEqual(articles[0].attachment[0].type, "Video");
    assert.strictEqual(articles[0].attachment[1].type, "Image");
    assert.strictEqual(articles[0].attachment[2].type, "Link");
  });

  test("returns empty array for unknown feed format", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><html><body>Not a feed</body></html>`;
    const articles = parseFeed(xml, "Unknown");
    assert.deepStrictEqual(articles, []);
  });

  test("handles RSS item with minimal fields and fallback defaults", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Minimal</title>
    <item>
      <link>https://example.com/minimal</link>
      <enclosure url="https://example.com/file.dat" />
    </item>
  </channel>
</rss>`;
    const articles = parseFeed(xml, "Fallback Author");
    const a = articles[0];
    assert.strictEqual(a.name, "");
    assert.strictEqual(a.content, "");
    assert.strictEqual(a.published, null);
    assert.strictEqual(a.attributedTo.name, "Fallback Author");
    assert.strictEqual(a.attachment[0].mediaType, "application/octet-stream");
    assert.strictEqual(a.attachment[0].type, "Link");
  });

  test("handles Atom entry with updated instead of published and no author", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Updated Blog</title>
  <entry>
    <title>Updated Only</title>
    <link rel="alternate" href="https://example.com/updated"/>
    <id>urn:uuid:updated</id>
    <updated>2024-06-01T12:00:00Z</updated>
    <content>Plain text content</content>
  </entry>
</feed>`;
    const articles = parseFeed(xml, "Fallback Name");
    const a = articles[0];
    assert.strictEqual(a.published, "2024-06-01T12:00:00.000Z");
    assert.strictEqual(a.attributedTo.name, "Fallback Name");
    assert.strictEqual(a.content, "Plain text content");
    assert.deepStrictEqual(a.tag, []);
  });

  test("handles Atom entry with non-alternate link rel", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Rel Blog</title>
  <entry>
    <title>Rel Entry</title>
    <link rel="enclosure" href="https://example.com/enc"/>
    <link rel="alternate" href="https://example.com/alt"/>
    <id>urn:uuid:rel</id>
    <published>2024-01-01T00:00:00Z</published>
    <author><name>Test</name></author>
    <content type="html"><![CDATA[<b>HTML</b>]]></content>
  </entry>
</feed>`;
    const articles = parseFeed(xml, "Test");
    // Should pick the alternate link
    assert.strictEqual(articles[0].id, "https://example.com/alt");
  });

  test("handles Atom entry with no published and no updated", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>No Date Blog</title>
  <entry>
    <title>No Date</title>
    <link href="https://example.com/nodate"/>
    <id>urn:uuid:nodate</id>
    <author><name>Test</name></author>
    <content>Just text</content>
  </entry>
</feed>`;
    const articles = parseFeed(xml, "Test");
    assert.strictEqual(articles[0].published, null);
  });

  test("handles Atom entry with no link elements", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>No Link Blog</title>
  <entry>
    <title>No Link</title>
    <id>urn:uuid:nolink</id>
    <published>2024-01-01T00:00:00Z</published>
    <author><name>Test</name></author>
  </entry>
</feed>`;
    const articles = parseFeed(xml, "Test");
    assert.strictEqual(articles[0].id, "");
    assert.strictEqual(articles[0].url, "");
  });

  test("handles Atom category with @_label instead of @_term", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Label Blog</title>
  <entry>
    <title>Labels</title>
    <link href="https://example.com/labels"/>
    <id>urn:uuid:labels</id>
    <published>2024-01-01T00:00:00Z</published>
    <author><name>Test</name></author>
    <category label="My Label"/>
  </entry>
</feed>`;
    const articles = parseFeed(xml, "Test");
    assert.strictEqual(articles[0].tag[0].name, "My Label");
  });

  test("handles RSS item with author field instead of dc:creator", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Author Blog</title>
    <item>
      <title>Author Test</title>
      <link>https://example.com/author</link>
      <description>test</description>
      <pubDate>Mon, 10 Mar 2024 10:00:00 GMT</pubDate>
      <author>dave@example.com</author>
    </item>
  </channel>
</rss>`;
    const articles = parseFeed(xml, "Default");
    assert.strictEqual(articles[0].attributedTo.name, "dave@example.com");
  });
});
