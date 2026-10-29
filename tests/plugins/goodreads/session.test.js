// ABOUTME: Tests that handed-over cookies are checked against what the profile stored.
// ABOUTME: Guards the silent case where Chrome drops a session cookie on context close.
import { test, describe } from "node:test";
import assert from "node:assert";
import { findMissingCookies } from "../../../plugins/goodreads/session.js";

describe("findMissingCookies", () => {
  const sessionCookie = { name: "_session_id2", value: "v", domain: ".goodreads.com", expires: -1 };
  const persistent = { name: "u", value: "v", domain: ".goodreads.com", expires: 1795894387 };

  test("reports nothing when every cookie survived", () => {
    assert.deepStrictEqual(findMissingCookies([persistent], [persistent]), []);
  });

  // Chrome does not write session cookies to disk, so a cookie with no expiry
  // disappears when the persistent context closes. Reporting success for it is
  // how `session set` silently did nothing.
  test("reports a session cookie that did not persist", () => {
    const missing = findMissingCookies([sessionCookie, persistent], [persistent]);
    assert.deepStrictEqual(
      missing.map((c) => c.name),
      ["_session_id2"],
    );
  });

  test("matches on name and domain together", () => {
    const requested = [{ name: "u", value: "v", domain: ".goodreads.com", expires: 1 }];
    const stored = [{ name: "u", value: "v", domain: ".amazon.com", expires: 1 }];
    assert.deepStrictEqual(
      findMissingCookies(requested, stored).map((c) => c.name),
      ["u"],
    );
  });

  test("ignores extra cookies already in the profile", () => {
    const stored = [persistent, { name: "ccsid", value: "x", domain: ".goodreads.com", expires: 1 }];
    assert.deepStrictEqual(findMissingCookies([persistent], stored), []);
  });

  test("reports everything when nothing was stored", () => {
    assert.strictEqual(findMissingCookies([sessionCookie, persistent], []).length, 2);
  });
});
