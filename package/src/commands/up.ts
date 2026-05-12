import {
  assertDockerAvailable,
  composeBuild,
  composeRun,
} from "../docker.js";
import { log } from "../log.js";
import { findSandboxVibeDir, SANDBOX_VIBE_DIR } from "../paths.js";

export interface UpOptions {
  shell?: boolean;
}

export async function up(options: UpOptions = {}): Promise<void> {
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

  if (options.shell) {
    log("Starting bash shell (Claude REPL skipped)...");
    await composeRun(vibeDir, { env: { SANDBOX_VIBE_MODE: "shell" } });
  } else {
    log("Starting Claude REPL...");
    await composeRun(vibeDir);
  }
}
