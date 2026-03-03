// src/core/as2.js
const AS2_CONTEXT = "https://www.w3.org/ns/activitystreams";

export function validateAS2(obj) {
  if (!obj || typeof obj !== "object") {
    return { valid: false, error: "AS2 object is required" };
  }
  if (obj["@context"] !== AS2_CONTEXT) {
    return { valid: false, error: `@context must be "${AS2_CONTEXT}"` };
  }
  if (typeof obj.type !== "string") {
    return { valid: false, error: "type must be a string" };
  }
  if (typeof obj.id !== "string") {
    return { valid: false, error: "id must be a string" };
  }
  if (typeof obj.published !== "string") {
    return { valid: false, error: "published must be a string" };
  }
  if (!obj.attributedTo || typeof obj.attributedTo !== "object") {
    return { valid: false, error: "attributedTo must be an object" };
  }
  if (typeof obj.attributedTo.name !== "string") {
    return { valid: false, error: "attributedTo.name must be a string" };
  }
  return { valid: true };
}
