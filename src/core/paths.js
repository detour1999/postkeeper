import { join } from "node:path";
import { homedir } from "node:os";

export function getConfigDir() {
  return (
    process.env.POSTKEEPER_CONFIG_DIR ||
    join(homedir(), ".config", "postkeeper")
  );
}

export function getDataDir() {
  return (
    process.env.POSTKEEPER_DATA_DIR ||
    join(homedir(), ".local", "share", "postkeeper")
  );
}

export function getConfigPath() {
  return join(getConfigDir(), "config.json");
}

export function getArchiveDir() {
  return join(getDataDir(), "archive");
}

export function getPluginDataDir(pluginName) {
  return join(getDataDir(), pluginName);
}
