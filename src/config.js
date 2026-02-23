// src/config.js
import { readFileSync } from "node:fs";

export function loadConfig(configPath) {
  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw);

  if (!config.profiles || config.profiles.length === 0) {
    throw new Error("config.profiles must contain at least one username");
  }

  return {
    profiles: config.profiles,
    output_dir: config.output_dir || "./output",
    profile_dir: config.profile_dir || "./.browser-profile",
  };
}
