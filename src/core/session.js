// ABOUTME: Parses cookie JSON into the shape Playwright's addCookies accepts.
// ABOUTME: Lets an agent hand a session it obtained elsewhere to a browser-based plugin.

// Browsers and cookie-export tools spell sameSite several ways; Playwright
// accepts only these three.
const SAME_SITE = {
  strict: "Strict",
  lax: "Lax",
  none: "None",
  no_restriction: "None",
};

const CONTEXT = "Expected an array of cookies, or an object with a \"cookies\" array.";

function cookieArrayFrom(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.cookies)) return parsed.cookies;
  return null;
}

function domainFrom(raw, index) {
  if (typeof raw.domain === "string" && raw.domain.length > 0) return raw.domain;
  if (typeof raw.url === "string" && raw.url.length > 0) {
    try {
      return new URL(raw.url).hostname;
    } catch {
      throw new Error(`Cookie ${index} has an unparseable url: ${raw.url}`);
    }
  }
  throw new Error(`Cookie ${index} (${raw.name}) is missing a domain or url.`);
}

function expiresFrom(raw) {
  // Playwright and CDP use `expires` in seconds; Cookie-Editor and friends use
  // a fractional `expirationDate`. -1 means a session cookie in both worlds.
  const value = typeof raw.expires === "number" ? raw.expires : raw.expirationDate;
  if (typeof value !== "number" || Number.isNaN(value)) return -1;
  return Math.floor(value);
}

function normalizeCookie(raw, index) {
  if (!raw || typeof raw !== "object") {
    throw new Error(`Cookie ${index} is not an object.`);
  }
  if (typeof raw.name !== "string" || raw.name.length === 0) {
    throw new Error(`Cookie ${index} is missing a name.`);
  }
  if (typeof raw.value !== "string") {
    throw new Error(`Cookie ${index} (${raw.name}) has a non-string value.`);
  }

  const sameSite = SAME_SITE[String(raw.sameSite ?? "").toLowerCase()] || "Lax";

  return {
    name: raw.name,
    value: raw.value,
    domain: domainFrom(raw, index),
    path: typeof raw.path === "string" && raw.path.length > 0 ? raw.path : "/",
    expires: expiresFrom(raw),
    httpOnly: Boolean(raw.httpOnly),
    secure: Boolean(raw.secure),
    sameSite,
  };
}

/**
 * Parse cookie JSON into cookies ready for Playwright's addCookies.
 * Throws an Error naming the problem — callers surface the message verbatim.
 */
export function parseCookieInput(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Cookie input is not valid JSON (${err.message}). ${CONTEXT}`);
  }

  const list = cookieArrayFrom(parsed);
  if (list === null) {
    throw new Error(`Cookie input holds no cookie array. ${CONTEXT}`);
  }
  if (list.length === 0) {
    throw new Error("Cookie input contains no cookies.");
  }

  return list.map(normalizeCookie);
}

/**
 * Describe cookies for logs and --json output, without their values.
 */
export function summarizeCookies(cookies) {
  return cookies.map((c) => ({
    name: c.name,
    domain: c.domain,
    expires: c.expires > 0 ? new Date(c.expires * 1000).toISOString() : "session",
  }));
}
