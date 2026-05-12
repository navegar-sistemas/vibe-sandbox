import { createHash } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config, Stack } from "./config.js";

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "templates",
);

export const TEMPLATE_FILES = {
  baseDockerfile: {
    template: "Dockerfile.sandbox.tpl",
    output: "Dockerfile.sandbox",
  },
  baseCompose: {
    template: "docker-compose.sandbox.yml.tpl",
    output: "docker-compose.sandbox.yml",
  },
  overrideDockerfile: {
    template: "Dockerfile.sandbox.override.tpl",
    output: "Dockerfile.sandbox.override",
  },
  overrideCompose: {
    template: "docker-compose.override.yml.tpl",
    output: "docker-compose.override.yml",
  },
} as const;

export async function renderTemplate(
  templateName: string,
  vars: Record<string, string>,
): Promise<string> {
  const tplPath = join(TEMPLATES_DIR, templateName);
  const tpl = await readFile(tplPath, "utf-8");
  const lookup = (key: string): string => getRequiredVar(vars, key, templateName);

  // Pass 1: whole-line comment markers `# vibe-render:NAME`. Used in
  // Dockerfile templates so the placeholder is a syntactically valid
  // comment and Dockerfile language servers do not flag it as an unknown
  // instruction. The marker line is replaced entirely by the variable
  // value (which itself can be multi-line).
  const afterCommentMarkers = tpl.replace(
    /^[ \t]*# vibe-render:(\w+)[ \t]*$/gm,
    (_match: string, key: string) => lookup(key),
  );

  // Pass 2: inline `${name}` placeholders for scalar values that must sit
  // inside an expression (compose YAML keys, the bootstrap marker name).
  return afterCommentMarkers.replace(
    /\$\{(\w+)\}/g,
    (_match: string, key: string) => lookup(key),
  );
}

function getRequiredVar(
  vars: Record<string, string>,
  key: string,
  templateName: string,
): string {
  const value = vars[key];
  if (value === undefined) {
    throw new Error(`Template ${templateName}: missing variable '${key}'.`);
  }
  return value;
}

export async function writeRendered(
  destDir: string,
  outputName: string,
  content: string,
): Promise<void> {
  const target = join(destDir, outputName);
  // Defense in depth: unlink any pre-existing entry first so a planted
  // symlink at `target` cannot redirect the write into a host file.
  // The directory itself is checked separately in `init`.
  try {
    await unlink(target);
  } catch {
    // ENOENT, EISDIR, or any other failure: writeFile below will surface
    // a real problem with the path.
  }
  await writeFile(target, content, "utf-8");
}

export function computeMarker(config: Config): string {
  const canonical = JSON.stringify({
    plugins: [...config.plugins].sort(),
    marketplaces: [...config.marketplaces].sort(),
    mcps: [...config.mcps]
      .map((m) => ({ name: m.name, transport: m.transport, url: m.url }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
  // 16 hex chars = 64 bits. Birthday collisions need ~5 billion configs;
  // targeted preimage on truncated SHA-256 is computationally expensive
  // enough that the marker is not a useful attack surface.
  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  return `bootstrap-${hash}`;
}

// Compose project name comes from the directory containing the YAML, which
// is `.sandbox-vibe` for every consumer of this CLI. Without further
// scoping, two unrelated projects would share the `sandbox-home` volume
// and leak Claude sessions, marketplace tokens, and installed plugins
// between them. The slug isolates volumes per workspace; a SHA-8 of the
// absolute workspace path disambiguates two projects that happen to share
// the same basename (e.g. `~/work/foo` vs `~/play/foo`).
export function computeProjectSlug(config: Config): string {
  const raw = basename(config.workspacePath).toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const safeBase = cleaned.length > 0 ? cleaned : "vibe";
  const pathHash = createHash("sha256")
    .update(config.workspacePath)
    .digest("hex")
    .slice(0, 8);
  return `${safeBase}-${pathHash}`;
}

export function renderVolumesBlock(config: Config, projectSlug: string): string {
  const lines: string[] = [
    `      - ${projectSlug}-sandbox-home:/home/sandbox`,
    `      - ${config.workspacePath}:/workspace`,
  ];
  for (const m of config.additionalMounts) {
    const ro = m.readonly ? ":ro" : "";
    lines.push(`      - ${m.hostPath}:${m.containerPath}${ro}`);
  }
  return lines.join("\n");
}

export function renderAdditionalDirsBlock(config: Config): string {
  const dirs: string[] = ["/workspace"];
  for (const m of config.additionalMounts) {
    dirs.push(m.containerPath);
  }
  return JSON.stringify(dirs, null, 2).replace(/\n/g, "\n            ");
}

export function renderEnabledPluginsBlock(config: Config): string {
  const obj: Record<string, true> = {};
  for (const p of config.plugins) obj[p] = true;
  return JSON.stringify(obj, null, 2).replace(/\n/g, "\n          ");
}

// Defensive dedupe by identity for each block: validateConfig already
// rejects duplicates, but a config.json hand-edited between load and
// render could still smuggle them in. `claude plugin marketplace add` and
// `claude mcp add` exit non-zero on duplicate registration; combined with
// the entrypoint's `set -e`, that would abort the bootstrap before the
// marker is written and trap the volume in a half-bootstrapped state.

function dedupe<T>(items: readonly T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export function renderMarketplacesBlock(config: Config): string {
  const unique = dedupe(config.marketplaces, (m) => m);
  if (unique.length === 0) {
    return "";
  }
  // Output of `claude plugin marketplace add` may include a clone URL with
  // an embedded credential when the host has Git auth configured. Redirect
  // to the (chmod-600) bootstrap log instead of teeing into the agent's
  // stdout where the assistant could later read it via tool use.
  // `|| true` keeps the bootstrap idempotent across volume retries: a
  // partial earlier run may have already registered the marketplace.
  return unique
    .map(
      (m) =>
        `          claude plugin marketplace add ${m} >>"$$BOOT_LOG" 2>&1 || true`,
    )
    .join("\n");
}

export function renderPluginLoopBlock(config: Config): string {
  const unique = dedupe(config.plugins, (p) => p);
  if (unique.length === 0) {
    return `            ""`;
  }
  return unique
    .map((p, idx) => {
      const continuation = idx === unique.length - 1 ? "" : " \\";
      return `            "${p}"${continuation}`;
    })
    .join("\n");
}

export function renderMcpsBlock(config: Config): string {
  const unique = dedupe(config.mcps, (m) => m.name);
  if (unique.length === 0) {
    return "";
  }
  // MCP URLs can carry secrets in basic-auth or query parameters; redirect
  // command output to the chmod-600 bootstrap log instead of teeing.
  // `|| true` keeps the bootstrap idempotent across volume retries.
  const lines = unique.map(
    (m) =>
      `          claude mcp add ${m.name} --scope user --transport ${m.transport} ${m.url} >>"$$BOOT_LOG" 2>&1 || true`,
  );
  return "\n" + lines.join("\n") + "\n";
}

export function renderStackBlock(stack: Stack): string {
  switch (stack) {
    case "none":
      return "# (no extra stack selected)";
    case "php":
      return [
        "# PHP intelephense (php-lsp plugin)",
        "RUN npm install -g intelephense",
      ].join("\n");
    case "dotnet":
      return [
        "# C# / .NET csharp-ls (csharp-lsp plugin)",
        "RUN apt-get update \\",
        " && apt-get install -y --no-install-recommends wget ca-certificates libicu72 \\",
        " && rm -rf /var/lib/apt/lists/* \\",
        " && wget -qO /tmp/dotnet-install.sh https://dot.net/v1/dotnet-install.sh \\",
        " && chmod +x /tmp/dotnet-install.sh \\",
        " && /tmp/dotnet-install.sh --channel 10.0 --install-dir /usr/share/dotnet \\",
        " && ln -s /usr/share/dotnet/dotnet /usr/local/bin/dotnet \\",
        " && rm /tmp/dotnet-install.sh \\",
        " && DOTNET_NOLOGO=1 DOTNET_CLI_TELEMETRY_OPTOUT=1 \\",
        "    dotnet tool install --tool-path /usr/local/bin csharp-ls",
      ].join("\n");
    case "python":
      return [
        "# Python pyright (pyright-lsp plugin)",
        "RUN apt-get update \\",
        " && apt-get install -y --no-install-recommends python3-pip \\",
        " && rm -rf /var/lib/apt/lists/* \\",
        " && npm install -g pyright",
      ].join("\n");
    case "go":
      // Force binaries into /usr/local/bin so the non-root `sandbox` user
      // can read+exec them (default `go install` location is /root/go/bin
      // which lives under root-only mode 700).
      return [
        "# Go gopls (gopls-lsp plugin)",
        "RUN apt-get update \\",
        " && apt-get install -y --no-install-recommends golang-go \\",
        " && rm -rf /var/lib/apt/lists/* \\",
        " && GOBIN=/usr/local/bin go install golang.org/x/tools/gopls@latest \\",
        " && chmod a+rx /usr/local/bin/gopls",
      ].join("\n");
    case "rust":
      // rustup-init writes to /root/.cargo (mode 700). Copy the binary the
      // plugin actually needs into /usr/local/bin so `sandbox` can use it.
      return [
        "# Rust rust-analyzer (rust-analyzer-lsp plugin)",
        "RUN apt-get update \\",
        " && apt-get install -y --no-install-recommends rustup \\",
        " && rm -rf /var/lib/apt/lists/* \\",
        " && rustup-init -y --default-toolchain stable --no-modify-path \\",
        " && /root/.cargo/bin/rustup component add rust-analyzer \\",
        " && cp /root/.cargo/bin/rust-analyzer /usr/local/bin/rust-analyzer \\",
        " && chmod a+rx /usr/local/bin/rust-analyzer",
      ].join("\n");
  }
}

export async function renderAll(
  destDir: string,
  config: Config,
): Promise<void> {
  const baseDockerfile = await renderTemplate(
    TEMPLATE_FILES.baseDockerfile.template,
    {},
  );
  await writeRendered(
    destDir,
    TEMPLATE_FILES.baseDockerfile.output,
    baseDockerfile,
  );

  const baseCompose = await renderTemplate(
    TEMPLATE_FILES.baseCompose.template,
    {
      cpus: String(config.resources.cpus),
      memoryGB: String(config.resources.memoryGB),
      pids: String(config.resources.pids),
      tmpfsMB: String(config.resources.tmpfsMB),
    },
  );
  await writeRendered(
    destDir,
    TEMPLATE_FILES.baseCompose.output,
    baseCompose,
  );

  const overrideDockerfile = await renderTemplate(
    TEMPLATE_FILES.overrideDockerfile.template,
    {
      stackBlock: renderStackBlock(config.stack),
    },
  );
  await writeRendered(
    destDir,
    TEMPLATE_FILES.overrideDockerfile.output,
    overrideDockerfile,
  );

  const projectSlug = computeProjectSlug(config);
  const overrideCompose = await renderTemplate(
    TEMPLATE_FILES.overrideCompose.template,
    {
      volumesBlock: renderVolumesBlock(config, projectSlug),
      additionalDirsBlock: renderAdditionalDirsBlock(config),
      enabledPluginsBlock: renderEnabledPluginsBlock(config),
      marketplacesBlock: renderMarketplacesBlock(config),
      pluginLoopBlock: renderPluginLoopBlock(config),
      mcpsBlock: renderMcpsBlock(config),
      marker: config.marker,
      projectSlug,
    },
  );
  await writeRendered(
    destDir,
    TEMPLATE_FILES.overrideCompose.output,
    overrideCompose,
  );
}
