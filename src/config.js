// src/config.js
import { readFileSync } from "node:fs";

export function loadConfig(configPath) {
  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw);

  return {
    archive_dir: config.archive_dir || "./archive",
    plugins: config.plugins || {},
  };
}
