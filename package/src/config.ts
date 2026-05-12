import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Stack = "none" | "php" | "dotnet" | "python" | "go" | "rust";

export type AdditionalMount = {
  hostPath: string;
  containerPath: string;
  readonly: boolean;
};

export type Resources = {
  cpus: number;
  memoryGB: number;
  pids: number;
  tmpfsMB: number;
};

export type Mcp = {
  name: string;
  transport: "http" | "sse";
  url: string;
};

export type Config = {
  schemaVersion: 1;
  workspacePath: string;
  additionalMounts: AdditionalMount[];
  resources: Resources;
  stack: Stack;
  plugins: string[];
  marketplaces: string[];
  mcps: Mcp[];
  marker: string;
};

export const CONFIG_FILE_NAME = "config.json";

export const STACKS: readonly Stack[] = [
  "none",
  "php",
  "dotnet",
  "python",
  "go",
  "rust",
];

export const DEFAULT_PLUGINS: string[] = [
  "security-guidance@claude-plugins-official",
  "commit-commands@claude-plugins-official",
  "code-review@claude-plugins-official",
  "pr-review-toolkit@claude-plugins-official",
  "claude-md-management@claude-plugins-official",
  "hookify@claude-plugins-official",
  "feature-dev@claude-plugins-official",
  "superpowers@superpowers-dev",
];

export const DEFAULT_MARKETPLACES: string[] = [
  "anthropics/claude-plugins-official",
  "obra/superpowers",
];

export const DEFAULT_RESOURCES: Resources = {
  cpus: 4,
  memoryGB: 4,
  pids: 256,
  tmpfsMB: 512,
};

// Strict identifier patterns. Defense in depth against shell injection
// when these strings are interpolated into the bash entrypoint of the
// generated docker-compose.override.yml. The character classes below were
// chosen to cover legitimate plugin / marketplace / MCP names while
// rejecting every shell metacharacter (`;`, `&`, `|`, `$`, backtick,
// quotes, newline, space).
export const PLUGIN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._/-]*$/;
export const MARKETPLACE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const MCP_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function validatePluginRef(value: string): string | true {
  if (!PLUGIN_PATTERN.test(value)) {
    return "must match name@marketplace using letters, digits, '.', '_', '-' (no spaces or shell metacharacters)";
  }
  return true;
}

export function validateMarketplaceRef(value: string): string | true {
  if (!MARKETPLACE_PATTERN.test(value)) {
    return "must match owner/repo using letters, digits, '.', '_', '-' (no spaces or shell metacharacters)";
  }
  return true;
}

export function validateMcpName(value: string): string | true {
  if (!MCP_NAME_PATTERN.test(value)) {
    return "must contain only letters, digits, '_' and '-'";
  }
  return true;
}

export function validateMcpUrl(value: string): string | true {
  if (/[\r\n\t]/.test(value)) {
    return "URL must not contain newline, carriage return, or tab";
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "must be a valid URL";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "URL must use http:// or https://";
  }
  // Basic-auth credentials in the URL would be passed verbatim to
  // `claude mcp add ... <url>` in the entrypoint, surfaced in `ps`,
  // captured into the bootstrap log, and visible to anyone who can
  // read process state. Force callers to use proper auth headers.
  if (parsed.username !== "" || parsed.password !== "") {
    return "URL must not contain basic-auth credentials (user:pass@); use Authorization headers instead";
  }
  return true;
}

export function validateHostPath(value: string): string | true {
  if (/[\r\n]/.test(value)) {
    return "path must not contain newline or carriage return";
  }
  // POSIX paths can technically contain ':' but that breaks the
  // host:container separator in docker-compose volumes. Reject defensively.
  if (value.includes(":")) {
    return "path must not contain ':'";
  }
  if (!value.startsWith("/")) {
    return "path must be absolute (start with '/')";
  }
  return true;
}

export function validateContainerPath(value: string): string | true {
  if (/[\r\n]/.test(value)) {
    return "path must not contain newline or carriage return";
  }
  if (value.includes(":")) {
    return "path must not contain ':'";
  }
  if (!value.startsWith("/")) {
    return "container path must be absolute (start with '/')";
  }
  return true;
}

export function loadConfig(vibeDir: string): Config {
  const configPath = join(vibeDir, CONFIG_FILE_NAME);
  const raw = readFileSync(configPath, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  validateConfig(parsed);
  return parsed;
}

export function saveConfig(vibeDir: string, config: Config): void {
  const configPath = join(vibeDir, CONFIG_FILE_NAME);
  // unlink first so a pre-existing symlink at configPath does not redirect
  // the write into a host file. Ignore ENOENT.
  try {
    unlinkSync(configPath);
  } catch {
    // Path doesn't exist or is not removable — writeFileSync below will
    // surface the real error if it is a problem.
  }
  writeFileSync(
    configPath,
    JSON.stringify(config, null, 2) + "\n",
    "utf-8",
  );
}

function validateConfig(value: unknown): asserts value is Config {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("config.json: expected an object at the root.");
  }
  const cfg = value as Record<string, unknown>;

  if (cfg.schemaVersion !== 1) {
    throw new Error(
      `config.json: unsupported schemaVersion ${String(cfg.schemaVersion)}; expected 1.`,
    );
  }

  if (typeof cfg.workspacePath !== "string" || cfg.workspacePath.length === 0) {
    throw new Error("config.json: workspacePath must be a non-empty string.");
  }
  const wsCheck = validateHostPath(cfg.workspacePath);
  if (wsCheck !== true) {
    throw new Error(`config.json: workspacePath ${wsCheck}.`);
  }

  if (typeof cfg.marker !== "string" || cfg.marker.length === 0) {
    throw new Error("config.json: marker must be a non-empty string.");
  }
  if (!/^bootstrap-[a-f0-9]{16}(-r\d+)?$/.test(cfg.marker)) {
    throw new Error(
      "config.json: marker must match pattern 'bootstrap-<16 hex chars>' or with optional '-r<N>' suffix.",
    );
  }

  if (
    typeof cfg.stack !== "string" ||
    !(STACKS as readonly string[]).includes(cfg.stack)
  ) {
    throw new Error(
      `config.json: stack must be one of ${STACKS.join("/")}; got ${String(cfg.stack)}.`,
    );
  }

  if (
    !Array.isArray(cfg.plugins) ||
    cfg.plugins.some((p) => typeof p !== "string")
  ) {
    throw new Error("config.json: plugins must be an array of strings.");
  }
  const pluginSeen = new Set<string>();
  for (const p of cfg.plugins) {
    const r = validatePluginRef(p as string);
    if (r !== true) {
      throw new Error(`config.json: plugin '${String(p)}' invalid — ${r}.`);
    }
    if (pluginSeen.has(p)) {
      throw new Error(
        `config.json: plugins contains duplicate entry '${p}'; each plugin must appear at most once.`,
      );
    }
    pluginSeen.add(p);
  }

  if (
    !Array.isArray(cfg.marketplaces) ||
    cfg.marketplaces.some((m) => typeof m !== "string")
  ) {
    throw new Error("config.json: marketplaces must be an array of strings.");
  }
  const marketplaceSeen = new Set<string>();
  for (const m of cfg.marketplaces) {
    const r = validateMarketplaceRef(m as string);
    if (r !== true) {
      throw new Error(`config.json: marketplace '${String(m)}' invalid — ${r}.`);
    }
    if (marketplaceSeen.has(m)) {
      throw new Error(
        `config.json: marketplaces contains duplicate entry '${m}'; each marketplace must appear at most once.`,
      );
    }
    marketplaceSeen.add(m);
  }

  if (!Array.isArray(cfg.mcps) || !cfg.mcps.every(isMcp)) {
    throw new Error(
      "config.json: mcps must be an array of { name: string, transport: 'http'|'sse', url: string }.",
    );
  }
  const mcpSeen = new Set<string>();
  for (const m of cfg.mcps) {
    const nameCheck = validateMcpName(m.name);
    if (nameCheck !== true) {
      throw new Error(`config.json: mcps[].name '${m.name}' invalid — ${nameCheck}.`);
    }
    const urlCheck = validateMcpUrl(m.url);
    if (urlCheck !== true) {
      throw new Error(`config.json: mcps[].url '${m.url}' invalid — ${urlCheck}.`);
    }
    if (mcpSeen.has(m.name)) {
      throw new Error(
        `config.json: mcps contains duplicate name '${m.name}'; each MCP must have a unique name (claude mcp add rejects duplicates and the bootstrap container aborts).`,
      );
    }
    mcpSeen.add(m.name);
  }

  if (
    !Array.isArray(cfg.additionalMounts) ||
    !cfg.additionalMounts.every(isAdditionalMount)
  ) {
    throw new Error(
      "config.json: additionalMounts must be an array of { hostPath: string, containerPath: string, readonly: boolean }.",
    );
  }
  for (const m of cfg.additionalMounts) {
    const hostCheck = validateHostPath(m.hostPath);
    if (hostCheck !== true) {
      throw new Error(
        `config.json: additionalMounts[].hostPath '${m.hostPath}' invalid — ${hostCheck}.`,
      );
    }
    const containerCheck = validateContainerPath(m.containerPath);
    if (containerCheck !== true) {
      throw new Error(
        `config.json: additionalMounts[].containerPath '${m.containerPath}' invalid — ${containerCheck}.`,
      );
    }
  }

  if (!isResources(cfg.resources)) {
    throw new Error(
      "config.json: resources must be { cpus, memoryGB, pids, tmpfsMB } with positive numbers (pids and tmpfsMB must be integers).",
    );
  }
}

function isMcp(value: unknown): value is Mcp {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === "string" &&
    typeof obj.url === "string" &&
    (obj.transport === "http" || obj.transport === "sse")
  );
}

function isAdditionalMount(value: unknown): value is AdditionalMount {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.hostPath === "string" &&
    typeof obj.containerPath === "string" &&
    typeof obj.readonly === "boolean"
  );
}

function isResources(value: unknown): value is Resources {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.cpus === "number" &&
    Number.isFinite(obj.cpus) &&
    obj.cpus > 0 &&
    typeof obj.memoryGB === "number" &&
    Number.isFinite(obj.memoryGB) &&
    obj.memoryGB > 0 &&
    typeof obj.pids === "number" &&
    Number.isInteger(obj.pids) &&
    obj.pids > 0 &&
    typeof obj.tmpfsMB === "number" &&
    Number.isInteger(obj.tmpfsMB) &&
    obj.tmpfsMB > 0
  );
}
