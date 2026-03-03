import { test, describe } from "node:test";
import assert from "node:assert";
import { validateAS2 } from "../../src/core/as2.js";

describe("validateAS2", () => {
  const validAS2 = {
    "@context": "https://www.w3.org/ns/activitystreams",
    type: "Note",
    id: "https://www.instagram.com/p/ABC123/",
    published: "2024-03-15T14:30:00.000Z",
    attributedTo: { type: "Person", name: "testuser" },
    content: "Hello",
  };

  test("returns true for a valid AS2 object", () => {
    const result = validateAS2(validAS2);
    assert.strictEqual(result.valid, true);
  });

  test("rejects missing @context", () => {
    const { "@context": _, ...obj } = validAS2;
    const result = validateAS2(obj);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("@context"));
  });

  test("rejects wrong @context", () => {
    const result = validateAS2({ ...validAS2, "@context": "wrong" });
    assert.strictEqual(result.valid, false);
  });

  test("rejects missing type", () => {
    const { type: _, ...obj } = validAS2;
    assert.strictEqual(validateAS2(obj).valid, false);
  });

  test("rejects missing id", () => {
    const { id: _, ...obj } = validAS2;
    assert.strictEqual(validateAS2(obj).valid, false);
  });

  test("rejects missing published", () => {
    const { published: _, ...obj } = validAS2;
    assert.strictEqual(validateAS2(obj).valid, false);
  });

  test("rejects missing attributedTo", () => {
    const { attributedTo: _, ...obj } = validAS2;
    assert.strictEqual(validateAS2(obj).valid, false);
  });

  test("rejects attributedTo without name", () => {
    const result = validateAS2({ ...validAS2, attributedTo: { type: "Person" } });
    assert.strictEqual(result.valid, false);
    assert.ok(result.error.includes("attributedTo.name"));
  });

  test("rejects null input", () => {
    assert.strictEqual(validateAS2(null).valid, false);
  });

  test("rejects non-object input", () => {
    assert.strictEqual(validateAS2("string").valid, false);
  });
});
