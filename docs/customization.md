# Customization

How to extend the sandbox after the initial setup: add a language server for your stack, add an MCP server, and change resource limits.

If you used `sandbox-vibe init`, edit the files in `.sandbox-vibe/` (the wizard already wrote them); if you set the template up by hand, edit the override files at the project root.

---

## Add a language server

Each Claude Code LSP plugin needs its corresponding binary on the container's `PATH`. `Dockerfile.sandbox.override.example` already has commented blocks per stack — uncomment the one for your language.

| Stack | Plugin | Binary on PATH | How it is installed |
| --- | --- | --- | --- |
| PHP | `php-lsp` | `intelephense` | `npm install -g` |
| C# / .NET | `csharp-lsp` | `csharp-ls` | `dotnet tool install -g` |
| Python | `pyright-lsp` | `pyright` | `npm install -g` |
| Go | `gopls-lsp` | `gopls` | `go install` |
| Rust | `rust-analyzer-lsp` | `rust-analyzer` | `rustup component add` |
| C / C++ | `clangd-lsp` | `clangd` | `apt-get install` |

After uncommenting the Dockerfile block:

1. Add the plugin name to `enabledPlugins` in the `settings.json` block of the entrypoint.
2. Add the same name to the `for p in ...` loop that runs `claude plugin install`.

Both lists must match. A plugin in `enabledPlugins` that is not installed will be reported as missing on startup.

---

## Add an MCP server

In `docker-compose.override.yml`, inside the `if [ ! -f .bootstrap-v1 ]` block, add the `claude mcp add` line **before** the closing `touch`:

```bash
claude mcp add NAME --scope user --transport http https://URL/mcp >>"$$BOOT_LOG" 2>&1
```

The `>>"$$BOOT_LOG" 2>&1` redirect (note the doubled `$$` — Compose interpolation requires it) sends both stdout and stderr to the bootstrap log without echoing them to the terminal, which avoids leaking tokens that may appear in clone error messages.

### Ready-to-use examples

```bash
claude mcp add context7 --scope user --transport http https://mcp.context7.com/mcp >>"$$BOOT_LOG" 2>&1
```

When you change the MCP list after the sandbox has already run once, **bump the marker** (manual path) or just re-run `up` (CLI path — the marker auto-derives from the config). See [manual-setup.md](manual-setup.md) for the marker bump procedure.

---

## Change CPU, memory, or process limits

The defaults are in `docker-compose.sandbox.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: "4"
      memory: 4G
      pids: 256
```

Change them in your override (not in the base) so that the change stays project-local:

```yaml
services:
  sandbox:
    deploy:
      resources:
        limits:
          cpus: "8"
          memory: 8G
          pids: 512
```

Increasing `pids` is the most common adjustment — workflows that run a watcher, a dev server, and a language server in parallel can hit the 256 default. Treat the new value as a budget, not a free pass: a runaway process bounded at 512 is still bounded.

---

## Add a runtime that is not pre-baked

The base image ships only Node, git, curl, and python3. To add a runtime, edit `Dockerfile.sandbox.override`:

```dockerfile
FROM sandbox-vibe-base:latest

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
      <your-package> \
    && rm -rf /var/lib/apt/lists/*
USER sandbox
```

Switch back to `USER sandbox` at the end so the entrypoint runs unprivileged. Any binary installed under `/usr/local/bin` or `/usr/bin` is on the `sandbox` user's PATH automatically.

For language toolchains that install into the home directory (Cargo, rustup, dotnet tool), install them as root and `chmod a+rx` the resulting binaries so the `sandbox` user can execute them. The example Dockerfile already does this for the Go and Rust blocks.

---

## See also

- [Architecture](architecture.md) — what changing the marker means and how bootstrap skipping works.
- [Manual setup](manual-setup.md) — the bare template flow without the CLI.
- [Troubleshooting](troubleshooting.md) — what to do when a customization breaks.
