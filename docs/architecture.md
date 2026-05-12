# Architecture

This document covers the design decisions behind `sandbox-vibe`: how the template is layered, how the bootstrap stays idempotent, what the security defaults are, and where the threat model boundary lies. Read this when you want to understand *why* something is the way it is, or before modifying the base template.

---

## Base / override split

The repository ships four files that combine into two layers.

| Layer | Git status | Files | Contents |
| --- | --- | --- | --- |
| **Base** | tracked, generic | `Dockerfile.sandbox`, `docker-compose.sandbox.yml` | The minimal `sandbox-vibe-base:latest` image (`node:24-slim` + git + curl + python3 + non-root user) and the resource / capability defaults that every sandbox inherits. |
| **Override example** | tracked, didactic | `Dockerfile.sandbox.override.example`, `docker-compose.override.example.yml` | Reference templates intended to be copied and edited. They show how to add stack-specific runtimes, plugin lists, MCPs, and bind mounts. |
| **Real override** | gitignored | `Dockerfile.sandbox.override`, `docker-compose.override.yml` | Yours. Contains absolute paths, chosen plugins, MCP credentials, runtimes for your stack. Never committed. |

**Rule:** any artifact containing absolute paths, credentials, specific plugin selections, or stack-specific runtimes is excluded from version control. The base layer must not reference any particular project, plugin, or stack.

When you use the CLI, this split is preserved automatically: `sandbox-vibe init` writes the four files into `.sandbox-vibe/` inside your project, and `.gitignore` is updated to exclude the real-override files.

---

## Per-project Claude home volume

The Claude home directory inside the container (`/home/sandbox`) is backed by a Docker named volume that is **per-project**. The volume name is derived from the workspace directory: `<basename>-<sha8(absolutePath)>-sandbox-home`.

Two different projects therefore do **not** share Claude sessions, marketplace tokens, installed plugins, or MCP configurations. The eight-character path hash disambiguates two projects that happen to have the same directory name.

Renaming the workspace directory changes the absolute path, which changes the hash, which produces a new volume — and triggers a fresh bootstrap. To prune obsolete volumes after renaming or removing projects, run `docker volume prune`.

---

## Idempotent bootstrap

The override entrypoint is an inline bash script with three phases.

### Phase 1 — every run

`~/.claude/settings.json` is rewritten on every container start. The file holds `permissions.additionalDirectories` (the project mounts) and `enabledPlugins`. Overwriting on every run is intentional: it makes the entrypoint the single source of truth for configuration. If the volume's filesystem drifts, the next `up` corrects it.

### Phase 2 — first run only

This phase is gated by a marker file at `~/.claude/.bootstrap-<hash>`, where `<hash>` is a 16-hex-character SHA-256 prefix of the canonical configuration (plugins + MCPs + marketplaces). On the first run, the marker is absent, and the entrypoint:

1. runs `claude plugin marketplace add` for each marketplace,
2. loops `claude plugin install` over each plugin,
3. runs `claude mcp add` for each MCP server,
4. `touch`es the marker once every preceding step has succeeded.

The whole phase executes under `set -e -o pipefail`. Any failure aborts the script before the `touch`, so an incomplete run is never recorded as completed. The next `up` will retry from the beginning.

The full log is written to `/tmp/sandbox-bootstrap.log`, which lives on tmpfs (volatile across runs) and has mode `600` (only the `sandbox` user can read it).

When the configuration changes — plugin added, MCP removed, marketplace renamed — the hash changes, and the next `up` re-bootstraps from scratch automatically. There is no manual step to remember.

### Phase 3 — every run

```bash
if [ -t 0 ]; then
  exec claude --dangerously-skip-permissions
else
  exit 0
fi
```

When stdin is a terminal, the entrypoint replaces itself with the Claude Code REPL. When it is not (CI, background `docker compose run`, healthchecks), the container exits cleanly without raising the error `Input must be provided either through stdin...`.

---

## Security defaults

The base layer applies the following defaults. They must not be removed or weakened without a documented trade-off recorded in the commit message and a corresponding update to `README.md`.

| Default | What it does | Why |
| --- | --- | --- |
| Non-root user (`sandbox`) | Runs the container as UID 1000, not root. | Reduces blast radius of any in-container process. |
| `cap_drop: ALL` | Removes every Linux capability. | Even root inside the container cannot mount, change network config, or load kernel modules. |
| `no-new-privileges:true` | Disables `setuid` / `setgid` escalation. | A compromised binary inside the container cannot regain privileges. |
| `network_mode: bridge` | Allows egress to the public internet; blocks the host LAN. | MCPs and plugin marketplaces work; the agent cannot reach your router, NAS, or other LAN devices. |
| `pids: 256` | Caps the number of processes. | Bounds runaway loops and fork bombs. |
| `tmpfs /tmp` | Mounts `/tmp` as ephemeral memory. | Bootstrap logs and scratch files do not persist across runs. |
| Per-project home volume | Decouples the container's `~/.claude` from the host's. | Host credentials, sessions, and tokens are unreachable from inside the container. |

These defaults make the **inside of the container** a strong isolation boundary. The agent can do whatever it wants within `/workspace` and the home volume; it cannot reach your host filesystem, your other projects, your SSH keys, or your AWS credentials.

---

## Threat model boundary

The defenses listed above are **kernel-enforced** by Docker. They protect the host from the agent that runs *inside* the container.

The `.claude/` directory in this repository — agents, hooks, slash commands, and `CLAUDE.md` — is a different surface. Those files describe how the agent *should* behave; they do not enforce that behavior against an agent that is instructed to ignore them. An adversarial editor with write access to the repo can simply remove or rewrite them.

The load-bearing defenses against an adversarial editor are **process-level**:

1. Branch protection on `main` (no direct pushes, required PR review).
2. CODEOWNERS for AI-governance surfaces (`.claude/`, `.github/workflows/`, the base templates, lint configs, `package/`).
3. Server-side CI that runs independently of any local hook configuration.
4. Human review of every PR that modifies AI-governance surfaces.

This boundary is documented in detail in [`SECURITY.md`](../SECURITY.md) under "Threat model boundary".

---

## Origin

`sandbox-vibe` was extracted from a real multi-stack project (Flutter + .NET + PHP, with nine sibling projects mounted in the same container, eleven plugins, two language servers, one MCP). The generic version drops what was specific to that stack but preserves the architectural decisions that hold for any project:

- base / override split with distinct `image:` tags per layer,
- `set -e -o pipefail` in the entrypoint,
- idempotent bootstrap marker keyed to configuration content,
- TTY detection before `exec claude`,
- bootstrap log redirected to a mode-600 file on tmpfs,
- CPU / memory / PIDs limits enforced by default.
