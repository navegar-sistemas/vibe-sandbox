import { statSync } from "node:fs";
import { join, resolve } from "node:path";

export const SANDBOX_VIBE_DIR = ".sandbox-vibe";

export function findSandboxVibeDir(cwd: string = process.cwd()): string | null {
  const candidate = resolve(cwd, SANDBOX_VIBE_DIR);
  try {
    if (statSync(candidate).isDirectory()) return candidate;
  } catch {
    // ENOENT or any other stat failure: treat as "not found".
  }
  return null;
}

export function sandboxVibePath(cwd: string, ...parts: string[]): string {
  return join(cwd, SANDBOX_VIBE_DIR, ...parts);
}
