#!/usr/bin/env node
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bumpMarker } from "./commands/bumpMarker.js";
import { init } from "./commands/init.js";
import { up } from "./commands/up.js";
import { log, logError } from "./log.js";
import { isAbortError } from "./prompts.js";

const PKG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "package.json",
);

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(PKG_PATH, "utf-8")) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

const program = new Command();

program
  .name("sandbox-vibe")
  .description(
    "Plug-and-play Docker sandbox for Claude Code with idempotent plugin and MCP bootstrap and security limits enforced by default.",
  )
  .version(getVersion(), "-v, --version", "output the current version");

program
  .command("init")
  .description(
    "Generate the .sandbox-vibe/ directory in the current project.",
  )
  .option(
    "-f, --force",
    "overwrite an existing .sandbox-vibe/ without confirmation",
  )
  .option(
    "--non-interactive",
    "skip the wizard and use defaults (suitable for CI)",
  )
  .action(
    async (opts: { force?: boolean; nonInteractive?: boolean }) => {
      await init({
        force: opts.force,
        nonInteractive: opts.nonInteractive,
      });
    },
  );

program
  .command("up")
  .description("Build the sandbox images and drop into the Claude REPL.")
  .option(
    "-s, --shell",
    "drop into an interactive bash shell instead of the Claude REPL (bootstrap still runs on first use)",
  )
  .action(async (opts: { shell?: boolean }) => {
    await up({ shell: opts.shell });
  });

program
  .command("bump-marker")
  .description(
    "Increment the bootstrap marker to force re-bootstrap on next up.",
  )
  .action(async () => {
    await bumpMarker();
  });

try {
  await program.parseAsync(process.argv);
} catch (err) {
  if (isAbortError(err)) {
    log("Aborted.");
    process.exit(0);
  }
  logError(describeError(err));
  process.exit(1);
}

function describeError(err: unknown): string {
  let raw: string;
  if (err instanceof Error) {
    // ExecaError exposes `shortMessage` (command + reason, without stdout/
    // stderr blocks). Prefer it; full `message` can be hundreds of lines.
    const maybeExeca = err as { shortMessage?: unknown };
    raw =
      typeof maybeExeca.shortMessage === "string"
        ? maybeExeca.shortMessage
        : err.message;
  } else {
    raw = `Unknown error: ${String(err)}`;
  }
  // Replace the user's home directory with `~` so error output dumped
  // into shared logs / CI does not leak the absolute filesystem layout.
  const home = homedir();
  return home.length > 0 ? raw.replaceAll(home, "~") : raw;
}
