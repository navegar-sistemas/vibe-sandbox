import { loadConfig, saveConfig } from "../config.js";
import { log } from "../log.js";
import { findSandboxVibeDir, SANDBOX_VIBE_DIR } from "../paths.js";
import { renderAll } from "../render.js";

export async function bumpMarker(): Promise<void> {
  const cwd = process.cwd();
  const vibeDir = findSandboxVibeDir(cwd);
  if (!vibeDir) {
    throw new Error(
      `No ${SANDBOX_VIBE_DIR}/ found. Run sandbox-vibe init first.`,
    );
  }

  const config = loadConfig(vibeDir);
  const previous = config.marker;
  config.marker = nextMarker(previous);

  await renderAll(vibeDir, config);
  saveConfig(vibeDir, config);

  log(`Marker: ${previous} -> ${config.marker}`);
  log("Re-bootstrap on next up.");
}

function nextMarker(current: string): string {
  const match = /^(.*)-r(\d+)$/.exec(current);
  if (!match) return `${current}-r1`;
  // Both capture groups are guaranteed when match is truthy; defaults satisfy
  // noUncheckedIndexedAccess without a non-null assertion.
  const [, base = "", numStr = "0"] = match;
  return `${base}-r${Number.parseInt(numStr, 10) + 1}`;
}
