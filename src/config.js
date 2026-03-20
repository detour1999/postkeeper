// src/config.js
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { getConfigDir, getConfigPath } from "./core/paths.js";

export function loadConfig(configPath) {
  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw);

  return {
    plugins: config.plugins || {},
  };
}

export function initConfigDir() {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  mkdirSync(configDir, { recursive: true });

  let created = false;
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify({ plugins: {} }, null, 2) + "\n");
    created = true;
  }

  return { created, configDir, configPath };
}

export function savePluginConfig(pluginName, pluginConfig) {
  const configPath = getConfigPath();
  const raw = readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw);

  config.plugins = config.plugins || {};
  config.plugins[pluginName] = { ...config.plugins[pluginName], ...pluginConfig };

  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}
