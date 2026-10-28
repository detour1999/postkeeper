// ABOUTME: Tests for cookie-input parsing used by `postkeeper session set`.
// ABOUTME: Covers the real export shapes agents and browsers produce, plus rejection cases.
import { test, describe } from "node:test";
import assert from "node:assert";
import { parseCookieInput, summarizeCookies } from "../../src/core/session.js";

describe("parseCookieInput shapes", () => {
  test("accepts a Playwright/CDP cookie array", () => {
    const cookies = parseCookieInput(
      JSON.stringify([
        {
          name: "_session_id2",
          value: "abc123",
          domain: ".goodreads.com",
          path: "/",
          expires: 1800000000,
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        },
      ]),
    );

    assert.deepStrictEqual(cookies, [
      {
        name: "_session_id2",
        value: "abc123",
        domain: ".goodreads.com",
        path: "/",
        expires: 1800000000,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);
  });

  test("unwraps a { cookies: [...] } envelope", () => {
    const cookies = parseCookieInput(
      JSON.stringify({ cookies: [{ name: "u", value: "v", domain: ".goodreads.com" }] }),
    );
    assert.strictEqual(cookies.length, 1);
    assert.strictEqual(cookies[0].name, "u");
  });

  test("drops fields Playwright's addCookies rejects", () => {
    const [cookie] = parseCookieInput(
      JSON.stringify([
        {
          name: "u",
          value: "v",
          domain: ".goodreads.com",
          size: 42,
          session: false,
          storeId: "0",
          hostOnly: false,
          sourceScheme: "Secure",
        },
      ]),
    );
    assert.deepStrictEqual(Object.keys(cookie).sort(), [
      "domain",
      "expires",
      "httpOnly",
      "name",
      "path",
      "sameSite",
      "secure",
      "value",
    ]);
  });

  test("reads Cookie-Editor's expirationDate as expires", () => {
    const [cookie] = parseCookieInput(
      JSON.stringify([
        { name: "u", value: "v", domain: ".goodreads.com", expirationDate: 1800000000.5 },
      ]),
    );
    assert.strictEqual(cookie.expires, 1800000000);
  });

  test("treats a cookie with no expiry as a session cookie", () => {
    const [cookie] = parseCookieInput(
      JSON.stringify([{ name: "u", value: "v", domain: ".goodreads.com" }]),
    );
    assert.strictEqual(cookie.expires, -1);
  });

  test("normalizes sameSite spellings browsers export", () => {
    const cookies = parseCookieInput(
      JSON.stringify([
        { name: "a", value: "v", domain: ".goodreads.com", sameSite: "no_restriction" },
        { name: "b", value: "v", domain: ".goodreads.com", sameSite: "lax" },
        { name: "c", value: "v", domain: ".goodreads.com", sameSite: "STRICT" },
        { name: "d", value: "v", domain: ".goodreads.com", sameSite: "unspecified" },
      ]),
    );
    assert.deepStrictEqual(
      cookies.map((c) => c.sameSite),
      ["None", "Lax", "Strict", "Lax"],
    );
  });

  test("accepts url in place of domain", () => {
    const [cookie] = parseCookieInput(
      JSON.stringify([{ name: "u", value: "v", url: "https://www.goodreads.com/" }]),
    );
    assert.strictEqual(cookie.domain, "www.goodreads.com");
  });

  test("defaults path to /", () => {
    const [cookie] = parseCookieInput(
      JSON.stringify([{ name: "u", value: "v", domain: ".goodreads.com" }]),
    );
    assert.strictEqual(cookie.path, "/");
  });
});

describe("parseCookieInput rejections", () => {
  test("rejects input that is not JSON", () => {
    assert.throws(() => parseCookieInput("_session_id2=abc; path=/"), /not valid JSON/i);
  });

  test("rejects an empty cookie list", () => {
    assert.throws(() => parseCookieInput("[]"), /no cookies/i);
  });

  test("rejects a JSON shape that holds no cookie array", () => {
    assert.throws(() => parseCookieInput('{"session":"abc"}'), /array of cookies/i);
  });

  test("names the offending index when a cookie has no name", () => {
    assert.throws(
      () =>
        parseCookieInput(
          JSON.stringify([
            { name: "ok", value: "v", domain: ".goodreads.com" },
            { value: "v", domain: ".goodreads.com" },
          ]),
        ),
      /cookie 1.*name/is,
    );
  });

  test("names the offending index when a cookie has no domain or url", () => {
    assert.throws(
      () => parseCookieInput(JSON.stringify([{ name: "u", value: "v" }])),
      /cookie 0.*domain/is,
    );
  });

  test("rejects a cookie whose url cannot be parsed", () => {
    assert.throws(
      () => parseCookieInput(JSON.stringify([{ name: "u", value: "v", url: "not a url" }])),
      /cookie 0.*unparseable url/is,
    );
  });

  test("rejects a list entry that is not an object", () => {
    assert.throws(() => parseCookieInput(JSON.stringify(["_session_id2=abc"])), /cookie 0.*not an object/is);
  });

  test("rejects a cookie whose value is not a string", () => {
    assert.throws(
      () => parseCookieInput(JSON.stringify([{ name: "u", value: 7, domain: ".goodreads.com" }])),
      /cookie 0.*value/is,
    );
  });
});

describe("summarizeCookies", () => {
  test("reports names and expiry without leaking values", () => {
    const summary = summarizeCookies([
      { name: "_session_id2", value: "secret", domain: ".goodreads.com", expires: 1800000000 },
      { name: "u", value: "alsosecret", domain: ".goodreads.com", expires: -1 },
    ]);

    assert.deepStrictEqual(summary, [
      { name: "_session_id2", domain: ".goodreads.com", expires: "2027-01-15T08:00:00.000Z" },
      { name: "u", domain: ".goodreads.com", expires: "session" },
    ]);
    assert.ok(!JSON.stringify(summary).includes("secret"));
  });
});
