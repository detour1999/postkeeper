// src/core/orchestrator.js
import { mkdirSync, writeFileSync, renameSync, copyFileSync, unlinkSync, existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { validateAS2 } from "./as2.js";

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

function deriveBaseName(as2) {
  const datePrefix = as2.published.slice(0, 10);
  let slug;
  try {
    const url = new URL(as2.id);
    const segments = url.pathname.split("/").filter(Boolean);
    slug = segments[segments.length - 1];
  } catch {
    slug = as2.id;
  }
  return `${datePrefix}-${slug}`;
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
    const { as2, raw, media } = post;
    const validation = validateAS2(as2);
    if (!validation.valid) {
      context.log(`Skipping post: invalid AS2 - ${validation.error}`);
      continue;
    }

    const baseName = deriveBaseName(as2);
    const postDir = join(archiveDir, plugin.name, "posts", as2.attributedTo.name);

    // Write AS2 JSON
    const as2Path = join(postDir, `${baseName}.as2.json`);
    mkdirSync(dirname(as2Path), { recursive: true });
    writeFileSync(as2Path, JSON.stringify(as2, null, 2));

    // Write raw JSON
    const rawPath = join(postDir, `${baseName}.raw.json`);
    writeFileSync(rawPath, JSON.stringify(raw, null, 2));

    // Move media files
    if (media && media.length > 0) {
      const mediaDir = join(postDir, baseName);
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
