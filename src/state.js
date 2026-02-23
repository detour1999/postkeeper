// src/state.js
import { readFileSync, writeFileSync } from "node:fs";

export function loadState(statePath) {
  try {
    return JSON.parse(readFileSync(statePath, "utf-8"));
  } catch {
    return {};
  }
}

export function saveState(statePath, state) {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function isNewPost(state, username, postTimestamp) {
  const lastSeen = state[username];
  if (!lastSeen) return true;
  return new Date(postTimestamp) > new Date(lastSeen);
}
