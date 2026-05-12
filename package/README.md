# sandbox-vibe

[![npm version](https://img.shields.io/npm/v/sandbox-vibe.svg)](https://www.npmjs.com/package/sandbox-vibe)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/navegar-sistemas/sandbox-vibe/blob/main/LICENSE)

> Plug-and-play Docker sandbox for AI-assisted vibe coding — Claude Code running isolated, with idempotent plugin/MCP bootstrap and security limits enforced by default.

When you let an AI agent edit your code, three things must hold at the same time:

1. The agent **cannot** delete `~/`, leak credentials, or run `rm -rf` on the host.
2. The agent **can** read and write only on the projects you authorize.
3. You **don't waste time** reconfiguring plugins, MCPs, and language servers every time you spin up a new container.

`sandbox-vibe` delivers all three through a four-file Docker template, distributed as this CLI.

---

## Quickstart

From inside the project you want to sandbox:

```bash
npx sandbox-vibe init     # interactive wizard
npx sandbox-vibe up       # build + run the Claude REPL
```

The wizard asks for the workspace path, optional sibling mounts, your stack (PHP / .NET / Python / Go / Rust LSP support), plugins, MCP servers, and resource limits. It writes the four sandbox files plus a `config.json` to `.sandbox-vibe/` in your project root and updates `.gitignore` for you.

The first `up` runs the bootstrap (installs marketplaces, plugins, MCPs, language servers) and drops into the Claude REPL. Every subsequent `up` skips the bootstrap and opens the REPL in milliseconds.

When you change the plugin or MCP list, just re-run `up` — the CLI detects the change automatically and re-bootstraps once.

---

## What you get

- **Kernel-enforced isolation** — non-root user, `cap_drop: ALL`, `no-new-privileges`, `pids: 256`, ephemeral `tmpfs /tmp`. The agent cannot reach your host filesystem, your SSH keys, or your other projects.
- **Per-project Claude home volume** — sessions, marketplace tokens, and installed plugins stay scoped to the project that created them. No cross-project credential leakage.
- **Idempotent bootstrap** — plugins, MCPs, and language servers install once on the first run and are skipped from then on. Changing the configuration retriggers a fresh bootstrap automatically.
- **Egress works, host LAN does not** — `network_mode: bridge` lets MCPs reach the public internet but blocks access to your router, NAS, or other LAN devices.

---

## Requirements

- Node.js 20 or newer (for the CLI itself).
- Docker Desktop or Docker Engine with Compose v2 (for the sandbox container).

---

## Commands

| Command | What it does |
| --- | --- |
| `sandbox-vibe init` | Interactive wizard that writes `.sandbox-vibe/` with the four sandbox files and a `config.json`. |
| `sandbox-vibe init --non-interactive` | Same, but uses defaults (suitable for CI). |
| `sandbox-vibe init --force` | Overwrite an existing `.sandbox-vibe/` without confirmation. |
| `sandbox-vibe up` | Build the sandbox images and drop into the Claude REPL. |
| `sandbox-vibe bump-marker` | Force a re-bootstrap on the next `up` (useful if you edited the entrypoint by hand). |

---

## Documentation

Full documentation lives in the GitHub repository:

- [**Architecture**](https://github.com/navegar-sistemas/sandbox-vibe/blob/main/docs/architecture.md) — base / override split, bootstrap phases, security defaults, threat model.
- [**Manual setup**](https://github.com/navegar-sistemas/sandbox-vibe/blob/main/docs/manual-setup.md) — clone and edit the template by hand, without the CLI.
- [**Customization**](https://github.com/navegar-sistemas/sandbox-vibe/blob/main/docs/customization.md) — add a language server, add an MCP server, change CPU / memory / PID limits.
- [**Troubleshooting**](https://github.com/navegar-sistemas/sandbox-vibe/blob/main/docs/troubleshooting.md) — common error messages and root causes.
- [**Security**](https://github.com/navegar-sistemas/sandbox-vibe/blob/main/SECURITY.md) — vulnerability disclosure, threat model boundary.
- [**Contributing**](https://github.com/navegar-sistemas/sandbox-vibe/blob/main/CONTRIBUTING.md) — PR flow, commit rules, local setup.
- [**Changelog**](https://github.com/navegar-sistemas/sandbox-vibe/blob/main/CHANGELOG.md) — version history.

---

## License

MIT — see [LICENSE](https://github.com/navegar-sistemas/sandbox-vibe/blob/main/LICENSE).
