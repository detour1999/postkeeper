// ABOUTME: Tracks discovered and completed item IDs for resumable Google Photos runs.
// ABOUTME: Persists state to progress.json in the plugin's data directory.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FILENAME = "progress.json";

export function loadProgress(dataDir) {
  try {
    const raw = readFileSync(join(dataDir, FILENAME), "utf-8");
    const data = JSON.parse(raw);
    return {
      discovered: data.discovered || [],
      completed: new Set(data.completed || []),
    };
  } catch {
    return { discovered: [], completed: new Set() };
  }
}

export function saveProgress(dataDir, progress) {
  const data = {
    discovered: progress.discovered,
    completed: [...progress.completed],
  };
  writeFileSync(join(dataDir, FILENAME), JSON.stringify(data, null, 2));
}

export function markDiscovered(progress, ids) {
  const existing = new Set(progress.discovered);
  for (const id of ids) {
    if (!existing.has(id)) {
      progress.discovered.push(id);
      existing.add(id);
    }
  }
}

export function markCompleted(progress, id) {
  progress.completed.add(id);
}

export function getPending(progress) {
  return progress.discovered.filter((id) => !progress.completed.has(id));
}
