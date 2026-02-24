// src/core/orchestrator.js
import { mkdirSync, writeFileSync, renameSync, copyFileSync, unlinkSync, existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { toAS2 } from "./as2.js";

function loadPluginState(archiveDir, pluginName) {
  const statePath = join(archiveDir, pluginName, "state.json");
  try {
    return JSON.parse(readFileSync(statePath, "utf-8"));
  } catch {
    return {};
  }
}

function savePluginState(archiveDir, pluginName, state) {
  const statePath = join(archiveDir, pluginName, "state.json");
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export async function runPlugin(plugin, pluginConfig, archiveDir) {
  const state = loadPluginState(archiveDir, plugin.name);
  const tmpDir = mkdtempSync(join(tmpdir(), `postkeeper-${plugin.name}-`));

  const context = {
    state,
    tmpDir,
    log: (msg) => console.log(`  [${plugin.name}] ${msg}`),
  };

  const result = await plugin.run(pluginConfig, context);

  for (const post of result.posts) {
    const { activity, raw, media } = post;
    const datePrefix = activity.timestamp.slice(0, 10);
    const baseName = `${datePrefix}-${activity.shortcode}`;
    const userDir = join(archiveDir, plugin.name, "posts", activity.username);

    // Write AS2 JSON
    const as2 = toAS2(activity, plugin.name);
    const as2Path = join(userDir, `${baseName}.as2.json`);
    mkdirSync(dirname(as2Path), { recursive: true });
    writeFileSync(as2Path, JSON.stringify(as2, null, 2));

    // Write raw JSON
    const rawPath = join(userDir, `${baseName}.raw.json`);
    writeFileSync(rawPath, JSON.stringify(raw, null, 2));

    // Move media files
    if (media && media.length > 0) {
      const mediaDir = join(userDir, baseName);
      mkdirSync(mediaDir, { recursive: true });
      for (const m of media) {
        if (m.tmpPath && existsSync(m.tmpPath)) {
          try {
            renameSync(m.tmpPath, join(mediaDir, m.relativePath));
          } catch {
            copyFileSync(m.tmpPath, join(mediaDir, m.relativePath));
            unlinkSync(m.tmpPath);
          }
        }
      }
    }
  }

  // Save updated state
  savePluginState(archiveDir, plugin.name, result.state);

  // Clean up temp directory
  rmSync(tmpDir, { recursive: true, force: true });
}
