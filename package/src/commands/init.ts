import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  type Config,
  DEFAULT_MARKETPLACES,
  DEFAULT_PLUGINS,
  DEFAULT_RESOURCES,
  saveConfig,
  validateContainerPath,
  validateHostPath,
  validateMcpName,
  validateMcpUrl,
} from "../config.js";
import { log } from "../log.js";
import {
  findSandboxVibeDir,
  sandboxVibePath,
  SANDBOX_VIBE_DIR,
} from "../paths.js";
import { checkbox, confirm, input, select } from "../prompts.js";
import { computeMarker, renderAll } from "../render.js";
import { isSensitivePath } from "../sensitive-paths.js";

const STACK_CHOICES = [
  { name: "none", value: "none" as const },
  { name: "php (intelephense)", value: "php" as const },
  { name: "dotnet (csharp-ls)", value: "dotnet" as const },
  { name: "python (pyright)", value: "python" as const },
  { name: "go (gopls)", value: "go" as const },
  { name: "rust (rust-analyzer)", value: "rust" as const },
];

async function confirmSensitiveMount(absolutePath: string): Promise<boolean> {
  log(
    `WARNING: '${absolutePath}' looks like a system or credentials path. Mounting it exposes its contents to the Claude agent inside the container.`,
  );
  return confirm({
    message: "Mount this path anyway?",
    default: false,
  });
}

export type InitOptions = {
  force?: boolean;
  nonInteractive?: boolean;
};

export async function init(opts: InitOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const existingDir = findSandboxVibeDir(cwd);

  if (existingDir && !opts.force) {
    if (opts.nonInteractive) {
      throw new Error(
        `${SANDBOX_VIBE_DIR}/ already exists. Use --force to overwrite.`,
      );
    }
    const overwrite = await confirm({
      message: `${SANDBOX_VIBE_DIR}/ already exists. Overwrite?`,
      default: false,
    });
    if (!overwrite) {
      log("Aborted by user.");
      return;
    }
  }

  const config = opts.nonInteractive
    ? buildDefaultConfig(cwd)
    : await runWizard(cwd);
  config.marker = computeMarker(config);

  const destDir = sandboxVibePath(cwd);
  // Refuse to write through a symlinked .sandbox-vibe/. mkdir { recursive }
  // would silently no-op when the path exists, and the subsequent writeFile
  // calls would then follow the symlink (e.g. into /etc) and clobber host
  // files. lstat (not stat) inspects the link itself.
  try {
    if (lstatSync(destDir).isSymbolicLink()) {
      throw new Error(
        `${destDir} is a symbolic link; refusing to follow. Replace it with a regular directory and re-run.`,
      );
    }
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.startsWith(`${destDir} is a symbolic link`)
    ) {
      throw err;
    }
    // Any other lstat error (typically ENOENT) is fine — mkdirSync below
    // will create the directory.
  }
  mkdirSync(destDir, { recursive: true });
  await renderAll(destDir, config);
  saveConfig(destDir, config);

  if (!opts.nonInteractive) {
    await maybeUpdateGitignore(cwd);
  }

  log(`Wrote ${SANDBOX_VIBE_DIR}/ with marker ${config.marker}.`);
  log("Run 'sandbox-vibe up' to start the sandbox.");
}

function buildDefaultConfig(cwd: string): Config {
  return {
    schemaVersion: 1,
    workspacePath: cwd,
    additionalMounts: [],
    resources: { ...DEFAULT_RESOURCES },
    stack: "none",
    plugins: [...DEFAULT_PLUGINS],
    marketplaces: [...DEFAULT_MARKETPLACES],
    mcps: [],
    marker: "",
  };
}

async function runWizard(cwd: string): Promise<Config> {
  const workspacePath = await promptHostPath(
    "Workspace path (mounted as /workspace)",
    cwd,
  );

  const additionalMounts = await promptAdditionalMounts();

  const stack = await select({
    message: "Stack for LSP support",
    choices: STACK_CHOICES,
    default: "none",
  });

  const plugins = await checkbox({
    message: "Plugins to enable",
    choices: DEFAULT_PLUGINS.map((p) => ({
      name: p,
      value: p,
      checked: true,
    })),
  });

  const mcps = await promptMcps();

  const useDefaults = await confirm({
    message: `Use default resources (${DEFAULT_RESOURCES.cpus} CPU, ${DEFAULT_RESOURCES.memoryGB}G mem, ${DEFAULT_RESOURCES.pids} PIDs, ${DEFAULT_RESOURCES.tmpfsMB}M tmpfs)?`,
    default: true,
  });
  const resources = useDefaults
    ? { ...DEFAULT_RESOURCES }
    : await promptResources();

  return {
    schemaVersion: 1,
    workspacePath,
    additionalMounts,
    resources,
    stack,
    plugins,
    marketplaces: [...DEFAULT_MARKETPLACES],
    mcps,
    marker: "",
  };
}

async function promptHostPath(
  message: string,
  defaultValue?: string,
): Promise<string> {
  while (true) {
    const raw = await input({
      message,
      default: defaultValue,
      validate: (value) => {
        const absolute = resolve(value);
        const formatCheck = validateHostPath(absolute);
        if (formatCheck !== true) return formatCheck;
        if (!existsSync(absolute)) return `Path does not exist: ${absolute}`;
        return true;
      },
    });
    const absolute = resolve(raw);
    // Resolve symlinks before the sensitive-path check so an attacker
    // cannot bypass it with `~/innocent-link -> /etc`. Docker mounts the
    // realpath anyway, so storing the resolved path keeps config and
    // runtime behaviour aligned.
    let real: string;
    try {
      real = realpathSync(absolute);
    } catch {
      log(`Cannot resolve real path for ${absolute}; please pick another.`);
      continue;
    }
    if (isSensitivePath(real)) {
      const ok = await confirmSensitiveMount(real);
      if (!ok) {
        log("Aborted mount; please pick another path.");
        continue;
      }
    }
    return real;
  }
}

async function promptAdditionalMounts(): Promise<Config["additionalMounts"]> {
  const mounts: Config["additionalMounts"] = [];
  let addMore = await confirm({
    message: "Add sibling mounts?",
    default: false,
  });
  while (addMore) {
    const hostPath = await promptHostPath("Host path (absolute)");
    const defaultContainerPath = `/workspace/${basename(hostPath)}`;
    const containerPath = await input({
      message: "Container path",
      default: defaultContainerPath,
      validate: (value) => validateContainerPath(value),
    });
    const readonly = await confirm({
      message: "Read-only?",
      default: false,
    });
    mounts.push({ hostPath, containerPath, readonly });
    addMore = await confirm({
      message: "Add another mount?",
      default: false,
    });
  }
  return mounts;
}

async function promptMcps(): Promise<Config["mcps"]> {
  const mcps: Config["mcps"] = [];
  const addMcp = await confirm({
    message: "Add MCP servers?",
    default: false,
  });
  if (!addMcp) return mcps;

  let more = true;
  while (more) {
    const name = await input({
      message: "MCP name",
      default: "context7",
      validate: (value) => {
        const nameCheck = validateMcpName(value);
        if (nameCheck !== true) return nameCheck;
        if (mcps.some((m) => m.name === value)) {
          return `MCP name "${value}" already added — pick a different name`;
        }
        return true;
      },
    });
    const url = await input({
      message: "MCP URL",
      default:
        name === "context7" ? "https://mcp.context7.com/mcp" : "",
      validate: (value) => validateMcpUrl(value),
    });
    mcps.push({ name, transport: "http", url });
    more = await confirm({
      message: "Add another MCP?",
      default: false,
    });
  }
  return mcps;
}

async function promptResources(): Promise<Config["resources"]> {
  const cpus = await promptPositiveNumber(
    "CPU limit (count)",
    DEFAULT_RESOURCES.cpus,
    false,
  );
  const memoryGB = await promptPositiveNumber(
    "Memory limit (GB)",
    DEFAULT_RESOURCES.memoryGB,
    false,
  );
  const pids = await promptPositiveNumber(
    "PID limit",
    DEFAULT_RESOURCES.pids,
    true,
  );
  const tmpfsMB = await promptPositiveNumber(
    "tmpfs /tmp size (MB)",
    DEFAULT_RESOURCES.tmpfsMB,
    true,
  );
  return { cpus, memoryGB, pids, tmpfsMB };
}

async function promptPositiveNumber(
  message: string,
  defaultValue: number,
  integer: boolean,
): Promise<number> {
  const raw = await input({
    message,
    default: String(defaultValue),
    validate: (v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return "must be > 0";
      if (integer && !Number.isInteger(n)) return "must be an integer";
      return true;
    },
  });
  return Number(raw);
}

async function maybeUpdateGitignore(cwd: string): Promise<void> {
  const gitignorePath = join(cwd, ".gitignore");
  const entry = `/${SANDBOX_VIBE_DIR}/`;

  // lstat (not stat) so we see the symlink itself, not its target.
  // Refusing to follow a symlink prevents an attacker who controls the
  // working directory (e.g. a malicious git checkout) from redirecting
  // our writeFile into /etc/hosts or any other host file.
  let isSymlink = false;
  let exists = false;
  try {
    const st = lstatSync(gitignorePath);
    exists = true;
    isSymlink = st.isSymbolicLink();
  } catch {
    // ENOENT or other stat error: treat as "does not exist".
  }

  if (isSymlink) {
    throw new Error(
      `.gitignore at ${gitignorePath} is a symbolic link; refusing to follow. Replace it with a regular file and re-run.`,
    );
  }

  if (!exists) {
    const create = await confirm({
      message: `No .gitignore found. Create one with '${entry}'?`,
      default: true,
    });
    if (create) {
      writeGitignoreSafely(gitignorePath, entry + "\n");
      log("Created .gitignore.");
    }
    return;
  }

  const content = readFileSync(gitignorePath, "utf-8");
  if (content.split(/\r?\n/).some((line) => line.trim() === entry)) {
    return;
  }
  const add = await confirm({
    message: `Add '${entry}' to .gitignore?`,
    default: true,
  });
  if (add) {
    const trailing = content.endsWith("\n") ? "" : "\n";
    writeGitignoreSafely(gitignorePath, content + trailing + entry + "\n");
    log("Updated .gitignore.");
  }
}

// Closes the TOCTTOU window between the earlier `lstatSync` check and the
// actual write: an attacker who creates a symlink at `gitignorePath`
// during that gap would otherwise see writeFileSync follow the link.
// `unlinkSync` removes a symlink without dereferencing it, and the
// subsequent `writeFileSync` creates a fresh regular file.
function writeGitignoreSafely(gitignorePath: string, content: string): void {
  try {
    unlinkSync(gitignorePath);
  } catch {
    // ENOENT or any other condition where unlink is a no-op; writeFileSync
    // below will surface a real failure.
  }
  writeFileSync(gitignorePath, content, "utf-8");
}

