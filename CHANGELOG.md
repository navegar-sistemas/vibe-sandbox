# Changelog

All notable changes to `sandbox-vibe` will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Duplicate MCP names no longer wedge the bootstrap container.** Before, the `init` wizard happily accepted the same MCP name twice (e.g. confirming the default `context7` on two consecutive iterations), and the rendered `docker-compose.override.yml` then emitted two `claude mcp add context7 ...` lines. The second call exits non-zero because that name is already registered; with `set -e -o pipefail` the entrypoint aborts before `touch ~/.claude/.bootstrap-<hash>`, leaving the volume in a half-initialised state from which subsequent `up` runs cannot recover without a manual `docker volume prune`. Three defences in depth land together: (1) `promptMcps` re-prompts when the typed name is already present in the in-progress list; (2) `validateConfig` rejects `mcps[]` with duplicate names (and now also `plugins[]` / `marketplaces[]` with duplicates), so an adulterated `config.json` cannot smuggle them past `up`; (3) `renderMcpsBlock` / `renderMarketplacesBlock` / `renderPluginLoopBlock` deduplicate defensively by identity before emitting a single line per entry.
- **Bootstrap is now resumable after a partial failure.** `claude plugin marketplace add` and `claude mcp add` now run with a trailing `|| true` in the rendered entrypoint. Previously, if any earlier `up` got far enough to register a marketplace or an MCP but then aborted (e.g. for an unrelated reason — flaky network during a `claude plugin install`), every subsequent `up` would hit "already exists" on the second try, abort under `set -e`, and require the user to manually `docker volume rm <project>-sandbox-home` to start over. The `|| true` only silences the idempotent "already registered" error; a real failure surfaces immediately downstream because `claude plugin install` (kept rigorous, no `|| true`) refuses to install plugins from an unregistered marketplace.

### Added

- `package/` package published to npm as `sandbox-vibe` — a TypeScript CLI that replaces the 9-step manual setup with two commands (`sandbox-vibe init` + `sandbox-vibe up`). The `init` wizard asks for workspace path, additional mounts, stack (none / php / dotnet / python / go / rust), plugins, MCP servers, and resource limits, then generates the four sandbox files and a `config.json` under `.sandbox-vibe/`. The bootstrap marker is auto-derived from a SHA-256 hash (16 hex chars) of plugins, marketplaces, and MCPs — any change to those lists triggers an automatic re-bootstrap on the next `up`. A `bump-marker` command remains as an escape hatch for forced re-bootstrap. The CLI is additive: the manual setup below remains fully supported.

### Security

- **Strict input validation**: `validateConfig` now rejects plugin/marketplace/MCP names with shell metacharacters and paths containing newline, carriage return, or `:`. The same regexes are applied symmetrically in the `init` wizard. Eliminates a CRITICAL bash-injection vector in the inline entrypoint of `docker-compose.override.yml` when `config.json` is adulterated.
- **Symlink refused on `.gitignore`**: `maybeUpdateGitignore` calls `lstatSync` before any read or write. A symbolic link aborts the command with a clear message; the writer no longer follows the link onto sensitive host files.
- **Per-project Docker volume**: the `sandbox-home` volume is now prefixed with a slug derived from the workspace's directory basename (e.g. `myproject-sandbox-home`). Different host projects no longer share Claude sessions, marketplace tokens, or installed plugins.
- **Bootstrap log redaction**: marketplace/plugin/MCP install output is redirected to `/tmp/sandbox-bootstrap.log` with `chmod 600` (instead of teed to stdout). HTTPS clone failures with embedded credentials no longer surface in the agent's terminal.
- **Marker hash bumped from 8 to 16 hex chars** (32 → 64 bits): collision probability under the birthday bound becomes negligible for any realistic configuration count.
- **System-path warning in the wizard**: paths matching `/`, `/etc`, `/root`, `/var`, `/sys`, `/proc`, `/usr`, `/boot`, `/dev`, or `~/.ssh|.aws|.gnupg|.docker|.kube|.config/gh|.npmrc` trigger an explicit `confirm` before being accepted as workspace or sibling mount.
- **Stack tools placed under `/usr/local/bin`**: Go and Rust blocks now install `gopls` and `rust-analyzer` to a path the non-root `sandbox` user can read and execute (previously they landed under `/root/{go,.cargo}` mode 700).
- **Error message sanitization**: `describeError` substitutes `os.homedir()` with `~` in any logged error (including `ExecaError.shortMessage`), preventing the user's absolute filesystem layout from leaking into shared CI/CD logs.
- **GitHub Actions pinned by commit SHA**: `actions/checkout`, `hadolint/hadolint-action`, `DavidAnson/markdownlint-cli2-action`, `gitleaks/gitleaks-action`, `docker/setup-buildx-action` are now pinned to immutable commit hashes (with the floating tag in a trailing comment for human reference). Mitigates supply-chain attacks via tag retargeting.
- **Dependabot now covers the `cli/` npm package**: weekly updates with `versioning-strategy: increase`. Closes the gap where transitive vulnerabilities in `@inquirer/prompts`, `commander`, `execa`, `tsup`, `typescript`, and `@types/node` were never auto-patched.
- **`CODEOWNERS` extended** to require `@navegar-sistemas` review on `package/package.json`, `package/package-lock.json`, `package/tsup.config.ts`, `package/tsconfig.json`, `package/templates/`, and `package/src/`. A typosquatted dep, malicious template, or build-pipeline edit cannot land without owner approval.
- Initial public release of the `sandbox-vibe` template.
- Base image (`sandbox-vibe-base:latest`) on `node:24-slim` with `git`, `curl`, `ca-certificates`, `openssh-client`, `python3`, `unzip`, `zip`.
- Non-root `sandbox` user inside the container.
- `docker-compose.sandbox.yml` with hardened defaults: `cap_drop: ALL`, `no-new-privileges`, `network_mode: bridge`, `pids: 256`, CPU/memory limits, and `tmpfs /tmp`.
- `Dockerfile.sandbox.override.example` with optional commented blocks for PHP (intelephense), C# / .NET (csharp-ls), Python (pyright), Go (gopls), and Rust (rust-analyzer).
- `docker-compose.override.example.yml` with idempotent bootstrap entrypoint (marker `~/.claude/.bootstrap-v1`), `set -e -o pipefail` discipline, TTY detection before `exec claude`, and tee'd bootstrap log at `/tmp/sandbox-bootstrap.log`.
- `.gitignore` covering generated overrides, common editor temp files, and runtime artifacts.
- README with quickstart, customization recipes, troubleshooting, and architectural rationale.
- `CONTRIBUTING.md` with ground rules, PR flow, and Conventional Commits guide.
- `SECURITY.md` with private vulnerability reporting policy.
- `.claude/CLAUDE.md` with guidance for Claude Code agents working on the template, including the repository-wide rule that warnings are defects of the same severity as errors (no intermediate severity is tolerated between approval and blocking) and the explicit recognition that the AI-governance tooling under `.claude/` is cooperative rather than adversarial.
- `SECURITY.md` "Threat model boundary" section documenting that `sandbox-vibe` controls the agent inside the container (Docker-enforced) but not an agent editing the template repository itself; the latter is governed by branch protection, CODEOWNERS, server-side CI, and human review.
- `.github/CODEOWNERS` extended to cover AI-governance surfaces (`.claude/CLAUDE.md`, `.claude/agents/`, `.claude/commands/`, `.claude/hooks/`, `.claude/settings.json`) and lint configuration (`.hadolint.yaml`, `.markdownlint.jsonc`, `.editorconfig`); changes to these files require explicit owner review.
- GitHub Actions CI: hadolint, `docker compose config`, markdownlint, gitleaks, build smoke test.
- Dependabot configuration for Docker base image and GitHub Actions updates.
- Issue and pull request templates.

[Unreleased]: https://github.com/navegar-sistemas/sandbox-vibe/compare/HEAD...HEAD
