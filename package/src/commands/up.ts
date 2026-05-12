import {
  assertDockerAvailable,
  composeBuild,
  composeRun,
} from "../docker.js";
import { log } from "../log.js";
import { findSandboxVibeDir, SANDBOX_VIBE_DIR } from "../paths.js";

export async function up(): Promise<void> {
  const cwd = process.cwd();
  const vibeDir = findSandboxVibeDir(cwd);
  if (!vibeDir) {
    throw new Error(
      `No ${SANDBOX_VIBE_DIR}/ found in current directory. Run 'sandbox-vibe init' first or cd into the project root.`,
    );
  }

  await assertDockerAvailable();
  log("Building images...");
  await composeBuild(vibeDir);
  log("Starting Claude REPL...");
  await composeRun(vibeDir);
}
