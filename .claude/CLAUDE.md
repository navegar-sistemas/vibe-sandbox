# CLAUDE.md

This document provides guidance for Claude Code agents working in this repository. It captures information that cannot be inferred from the source code itself. The file is tracked at `.claude/CLAUDE.md` and defines the rules that every contributor must follow.

## Project Overview

`sandbox-vibe` is a plug-and-play Docker template for running Claude Code (or another AI agent) in isolation, with idempotent bootstrap of plugins and MCP servers and a set of security limits applied by default.

The repository is not an application but a four-file template — `Dockerfile.sandbox`, `docker-compose.sandbox.yml`, and the two `*.override.example` files — intended to be cloned or forked by downstream projects to obtain a single-command sandbox. The base stack is `node:24-slim` with `git`, `curl`, and `python3`. Additional runtimes (PHP, .NET, Python, Go, Rust) are introduced through the override layer.

## Build and Validation Commands

```bash
# Validate compose syntax
docker compose -f docker-compose.sandbox.yml config

# Lint Dockerfiles (requires hadolint)
hadolint Dockerfile.sandbox
hadolint Dockerfile.sandbox.override.example

# Build the base image
docker compose -f docker-compose.sandbox.yml build

# Smoke test: image starts and required tools are on PATH
docker compose -f docker-compose.sandbox.yml run --rm sandbox \
  bash -c "node --version && git --version && python3 --version"

# Lint markdown (requires markdownlint-cli2)
markdownlint-cli2 "**/*.md"

# Secret scan (requires gitleaks)
gitleaks detect --source . --no-git
```

The same checks run in continuous integration on every pull request and on each push to `main`. The workflow definition is available at `.github/workflows/ci.yml`.

## Architecture

### Base and override separation

| Layer | Git status | Contents |
| --- | --- | --- |
| Base — `Dockerfile.sandbox`, `docker-compose.sandbox.yml` | Tracked; generic | Minimal `sandbox-vibe-base:latest` image, CPU, memory, and PID limits, security defaults |
| Override example — `*.override.example` | Tracked; didactic | Reference template intended for the user to copy and edit |
| Real override — `docker-compose.override.yml`, `Dockerfile.sandbox.override` | Gitignored | Project mounts with absolute paths, plugin and MCP list, stack-specific runtimes |

Architectural rule: any artifact containing absolute paths, credentials, specific plugin selections, or stack-specific runtimes is excluded from version control. The base layer must not reference any particular project, plugin, or stack. Only content that is generic to all users may be committed.

### Idempotent bootstrap

The inline entrypoint defined in `docker-compose.override.example.yml` proceeds through three phases.

1. **On every run.** `~/.claude/settings.json` is written. The file is overwritten on each execution by design, ensuring that the source of truth for the configuration is the entrypoint rather than the volume's filesystem.
2. **On the first run only**, gated by the marker `~/.claude/.bootstrap-v1`:
   - `claude plugin marketplace add`
   - A loop invoking `claude plugin install` for each listed plugin
   - `claude mcp add` for each MCP server
   - `touch ~/.claude/.bootstrap-v1` once the preceding steps have completed
   - The phase executes under `set -e -o pipefail`. Any failure aborts the script before the `touch`, ensuring that an incomplete run is not recorded as completed. The full log is written to `/tmp/sandbox-bootstrap.log` (tmpfs).
3. **On every run.** The construct `if [ -t 0 ]; then exec claude ...; else exit cleanly` ensures that an interactive terminal opens the REPL, while continuous integration and background contexts exit cleanly without producing the error `Input must be provided either through stdin...`.

When the plugin or MCP list is modified, the marker number must be incremented (`bootstrap-v1` → `bootstrap-v2`) at every occurrence within the entrypoint in order to force a re-bootstrap. Without this increment, sandboxes already initialized retain the previous list because the marker is still present.

### Security defaults

The following defaults must not be removed or weakened without a documented trade-off recorded in the commit message:

- Non-root user (`sandbox`) inside the container
- `cap_drop: ALL` — no Linux capabilities are granted
- `security_opt: no-new-privileges:true` — `setuid` and `setgid` operations are disabled
- `network_mode: bridge` — egress to the public network is available; the host LAN is not reachable
- `pids: 256` — process limit
- `tmpfs /tmp` — ephemeral storage between executions
- The `sandbox-home` volume is independent of the host's `~/.claude`; host credentials are therefore unreachable from within the container

Any modification to the above constitutes an architectural decision and requires explicit justification in the commit message and a corresponding update to `README.md`.

## Conventions

- **Shell variable escaping in Compose.** Compose interpolates `$VAR`. To preserve a bash variable for the runtime shell, use `$$VAR` (two dollar signs). This applies to `$p`, `$BOOT_LOG`, and any other YAML string that contains shell.
- **Edits to base versus override.** A change that applies universally is made to the base. A change specific to a stack, plugin, or path is made to the `*.example` template (or to the real `*.override`, which is gitignored).
- **Minimal base.** The base image does not include `xz-utils`, manual pages, or supplementary runtimes. Adding a tracked dependency requires universal justification.
- **Marker increments.** The marker name (`.bootstrap-v1`) and its number are coupled. A change that invalidates the previous state of the home volume must result in an increment at every occurrence — that is, at the two entrypoint sites that reference `bootstrap-v1`, and not at `settings.json`.
- **Docker image tagging.** The base is tagged `sandbox-vibe-base:latest` and the override is tagged `sandbox-vibe:latest`. These tags must not be changed without a corresponding update to `README.md` and the relevant workflows.

## Repository-wide rules

The rules in this section govern the repository itself and are independent of any individual contributor's working style. They apply to every contribution.

- **Language of artifacts.** Every artifact tracked in this repository must be written in English. This requirement applies to source code; comments and docstrings within source files; commit messages; branch names; pull request and issue titles and descriptions; runtime log, print, and error messages; identifiers and technical terms; narrative documentation (`README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, troubleshooting, comparisons, frequently asked questions); the present `.claude/CLAUDE.md`; and any `#` or `//` comments within code blocks embedded in tracked files. The repository is an open-source template intended for the broadest possible reach, and English is the industry default for surfaces read by external contributors, automated tooling, public indexers, and the language model itself.

- **`Co-Authored-By` trailers are prohibited in commit messages.** The addition of `Co-Authored-By` lines referencing Claude, Anthropic, or any other artificial intelligence to commit messages is not permitted. Commit messages contain only the developer's attribution.

- **Code comments are restricted to non-obvious rationale.** A comment is justified only when it documents a non-obvious rationale: a hidden business rule, an architectural decision, a workaround for a specific defect, or a subtle invariant. The following are prohibited:
  - Comments that restate the name of the method or class.
  - Comments that describe what the code does.
  - Comments that narrate trivial examples.
  - Comments that reference the current task (for example, "removed in task X" or "fix for bug Y"); such information belongs in the pull request or commit message.
  - Narrative comments recounting the problem the code solves, the historical motivation, or hypothetical scenarios; this material belongs in the commit message and pull request.
  - Docstrings that explain the architectural reason for the existence of a unit (for example, "without this, X breaks" or "replaces Y").
  - Decorative headers such as `# ====== MY SECTION ======`.
  - Short trace comments (`// new`, `// added`, `// changed`); such information is already recorded in version control.

  Before writing a comment, the author should evaluate whether its removal would leave a reader unfamiliar with the code unable to determine what the code does. If the answer is negative, the comment must not be written. If the answer is affirmative, the comment must be limited to the rationale and stated in a single line. The codebase describes present behavior, not the history of its construction; a reader seeking that history should consult `git log` and the corresponding pull request. When a comment or docstring is justified, it must be written in English, consistent with the language rule above.

- **Warnings constitute defects of the same severity as errors.** Any warning, deprecation notice, or non-success status emitted by a build, linter, hook, validator, runtime check, or review process is a defect. The qualifiers "minor", "non-blocking", "negligible", and "acceptable" are not valid in this repository when applied to a warning; the only valid resolution is to eliminate the underlying cause. Continuous integration configurations must therefore set warning-as-failure thresholds (for example, `hadolint` with `failure-threshold: warning`), and any review process treats every warning-class violation as a blocking finding. When a warning originates from an upstream tool and cannot be eliminated locally, the acceptable resolutions are: to upgrade to a version that does not produce the warning; to file an upstream issue and document the dependency in the affected configuration; or to suppress the specific rule with explicit justification recorded in the configuration. Silent acceptance is not permitted, and there is no intermediate severity tolerance between approval and blocking.

- **Verify clean state before claiming completion.** Before reporting any task as done — implemented, fixed, refactored, validated, ready to merge — the agent must run every static check relevant to the changes and confirm exit code 0 with zero warnings. The check set to consider includes the TypeScript type-check (`tsc --noEmit`), the build, `hadolint`, `markdownlint`, `gitleaks`, `docker compose config`, the project test suites, and the IDE / language-server diagnostics surfaced on the modified files. An unrun check that should have been run is itself a defect under the warnings-as-errors rule above; "the code is ready but not tested" is not a valid completion state. Any warning, deprecation notice, or non-zero exit code surfaced by a check must be remediated and the verification re-run before completion is reported. Status reports must reflect the actual output of the checks honestly: partial coverage may be acknowledged as partial when the user agreed to it in advance, but never disguised as completion. When a verification cannot be exercised in the current environment (no Docker daemon, no TTY for an interactive prompt), refactor the code into a testable surface (a pure function, a non-interactive flag) before declaring the task done; an untestable surface is itself a defect to fix.

- **Self-governing tooling under `.claude/` assumes a cooperating agent.** The rules in this file, the agents in `.claude/agents/`, the hooks in `.claude/hooks/`, and the slash commands in `.claude/commands/` make rule violations visible at the moment of action; they do not enforce those rules against an agent instructed to subvert them. The load-bearing defense against a non-cooperating editor is process-level: branch protection on `main`, code ownership for AI-governance surfaces (declared in `.github/CODEOWNERS`), continuous integration that runs server-side and independently of any local hook configuration, and human review of every pull request that modifies `.claude/`, `.hadolint.yaml`, `.markdownlint.jsonc`, `.editorconfig`, `.github/workflows/`, the base `Dockerfile.sandbox`, or the base `docker-compose.sandbox.yml`. Any pull request that touches those surfaces is security-sensitive by definition; reviewers must read the diff with adversarial intent and never approve based on a summary alone. The threat model boundary is documented in `SECURITY.md` under "Threat model boundary".
