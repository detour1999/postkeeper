// tests/plugins/meta-archive/parser.test.js
import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseInstagramJSON, parseFacebookJSON, parseInstagramHTML, fixMetaEncoding } from "../../../plugins/meta-archive/parser.js";

const fixturesDir = join(import.meta.dirname, "../../fixtures");

describe("fixMetaEncoding", () => {
  test("fixes double-encoded UTF-8", () => {
    // "Fêted" double-encoded: ê = C3 AA in UTF-8, stored as \u00c3\u00aa
    assert.strictEqual(fixMetaEncoding("F\u00c3\u00aated"), "Fêted");
  });

  test("fixes Schrodinger umlaut", () => {
    assert.strictEqual(fixMetaEncoding("Schr\u00c3\u00b6dinger"), "Schrödinger");
  });

  test("passes through normal ASCII text", () => {
    assert.strictEqual(fixMetaEncoding("Hello world"), "Hello world");
  });

  test("handles empty string", () => {
    assert.strictEqual(fixMetaEncoding(""), "");
  });
});

describe("parseInstagramJSON", () => {
  test("parses Instagram export JSON into AS2 objects", () => {
    const json = JSON.parse(readFileSync(join(fixturesDir, "meta-instagram.json"), "utf-8"));
    const posts = parseInstagramJSON(json, "detour1999");

    assert.strictEqual(posts.length, 2);

    const first = posts[0];
    assert.strictEqual(first.as2["@context"], "https://www.w3.org/ns/activitystreams");
    assert.strictEqual(first.as2.type, "Note");
    assert.ok(first.as2.published);
    assert.strictEqual(first.as2.attributedTo.name, "detour1999");
    assert.strictEqual(first.as2.generator.name, "Instagram");
    // Caption should have fixed encoding
    assert.ok(first.as2.content.includes("Fêted"));
    assert.strictEqual(first.as2.attachment.length, 2);

    // Second post has empty caption
    assert.strictEqual(posts[1].as2.content, "");
  });

  test("includes media URIs in raw data", () => {
    const json = JSON.parse(readFileSync(join(fixturesDir, "meta-instagram.json"), "utf-8"));
    const posts = parseInstagramJSON(json, "testuser");

    assert.strictEqual(posts[0].mediaUris.length, 2);
    assert.ok(posts[0].mediaUris[0].includes("18035531567732190.jpg"));
  });
});

describe("parseFacebookJSON", () => {
  test("parses Facebook export JSON into AS2 objects", () => {
    const json = JSON.parse(readFileSync(join(fixturesDir, "meta-facebook.json"), "utf-8"));
    const posts = parseFacebookJSON(json, "dylanr");

    assert.strictEqual(posts.length, 2);

    const first = posts[0];
    assert.strictEqual(first.as2.type, "Note");
    assert.ok(first.as2.published);
    assert.strictEqual(first.as2.attributedTo.name, "dylanr");
    assert.ok(first.as2.content.includes("road trip"));
    assert.strictEqual(first.as2.attachment.length, 2);
    assert.strictEqual(first.as2.generator.name, "Facebook");

    // Second post has no media
    assert.strictEqual(posts[1].as2.content, "HOT DOG!");
    assert.strictEqual(posts[1].as2.attachment.length, 0);
  });
});

describe("parseInstagramHTML", () => {
  test("parses Instagram HTML export into AS2 objects", () => {
    const html = readFileSync(join(fixturesDir, "meta-instagram.html"), "utf-8");
    const posts = parseInstagramHTML(html, "detour-cars");

    assert.strictEqual(posts.length, 2);

    const first = posts[0];
    assert.strictEqual(first.as2.type, "Note");
    assert.strictEqual(first.as2.content, "First caption here");
    assert.ok(first.as2.published);
    assert.strictEqual(first.as2.attributedTo.name, "detour-cars");
    assert.strictEqual(first.as2.attachment.length, 1);

    const second = posts[1];
    assert.strictEqual(second.as2.content, "Second caption");
    assert.strictEqual(second.as2.attachment.length, 2);
    assert.strictEqual(second.mediaUris.length, 2);
  });
});
