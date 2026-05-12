# Security Policy

## Supported versions

`sandbox-vibe` is a template, not a long-running service. The supported version is whatever is on the `main` branch and the most recent tagged release. Older tags are not actively maintained — please update to the latest before reporting an issue.

| Version | Supported |
| --- | --- |
| `main` (HEAD) | Yes |
| Latest tagged release | Yes |
| Previous tags | No — please upgrade |

## Reporting a vulnerability

**Do not open public issues for vulnerabilities.** Use one of the private channels below.

### Preferred: GitHub Private Vulnerability Reporting

Open a private advisory at:

<https://github.com/navegar-sistemas/sandbox-vibe/security/advisories/new>

Reports here are encrypted and visible only to repository maintainers. You can include reproduction steps, affected configurations, and any patch suggestions.

### What to include

- A clear description of the issue and the impact (e.g. "container escape via X", "secret leak via Y")
- Reproduction steps — exact `docker compose ...` commands, file changes, environment
- Versions: Docker, host OS, base image (`node:24-slim` digest), Claude Code version (if applicable)
- Suggested mitigation, if you have one

### Response timeline

Maintainers commit to:

- Acknowledging receipt within **3 business days**
- A first technical assessment (confirmed / not reproducible / out of scope) within **7 business days**
- Public disclosure coordinated with the reporter — typically after a fix is available, or 90 days from the initial report, whichever comes first

If you don't get a response within 7 business days, please re-send the advisory to ensure it didn't get lost.

## Out of scope

The following are **not** considered vulnerabilities in `sandbox-vibe`:

- Issues that require modifying the `Dockerfile.sandbox.override` or `docker-compose.override.yml` to weaken the base security defaults (the user is responsible for not removing `cap_drop: ALL`, `no-new-privileges`, etc.)
- Issues caused by mounting host directories with write permission and an untrusted agent — the threat model assumes the user controls which directories to mount
- Issues in third-party Claude Code plugins or MCPs installed via the override — please report those upstream
- Bugs in upstream images (`node:24-slim`, Debian packages) — please report to the upstream maintainers; this project will pick up fixes via image updates

## Threat model boundary

`sandbox-vibe` controls the AI agent that runs **inside** the container at use time. The Docker runtime enforces the limits — `cap_drop: ALL`, non-root user, `no-new-privileges`, `network_mode: bridge`, PID and `tmpfs` limits, and volume isolation between the host's `~/.claude` and the `sandbox-home` volume. The agent inside the container has no filesystem access to the template repository; it sees only what is mounted under `/workspace` and the contents of the `sandbox-home` volume.

`sandbox-vibe` **does not and cannot** protect against an AI agent that is editing the template repository itself on a developer's host. That agent runs outside any sandbox defined by this template; whatever isolation it has comes from Claude Code's own permission system on the host, not from `sandbox-vibe`. Such an agent has filesystem access to every file in the repository, including the files in `.claude/` that govern its own behavior — the rules in `.claude/CLAUDE.md`, the agents in `.claude/agents/`, the hooks in `.claude/hooks/`, and the slash commands in `.claude/commands/`. A non-cooperating agent can edit those files to weaken the rules it is expected to follow.

The defenses against this threat model are process-level, not file-level:

- Branch protection on `main` configured at the GitHub level: required pull request review, required status checks resolved from the default branch (so a pull request cannot disable its own checks), and no direct pushes.
- `.github/CODEOWNERS` covering AI-governance surfaces — `.claude/CLAUDE.md`, `.claude/agents/`, `.claude/commands/`, `.claude/hooks/`, `.claude/settings.json`, `.hadolint.yaml`, `.markdownlint.jsonc`, `.editorconfig`, the base `Dockerfile.sandbox`, the base `docker-compose.sandbox.yml`, and `.github/workflows/`. Owner review is required for any change to these paths.
- Continuous integration that runs on the server, independently of any local hook configuration the editing agent might modify.
- Human review of every diff that touches the surfaces listed above; the diff is to be read with adversarial intent and never approved on a summary alone.

The rules and tooling under `.claude/` assume a cooperating agent. They make rule violations visible at the moment of action, but they are not a barrier against an agent instructed to subvert them. Pull requests that modify those surfaces are security-sensitive by definition.

## Hardening guidance

Users adopting the template should additionally:

- Pin the base image digest (`FROM node:24-slim@sha256:...`) in `Dockerfile.sandbox.override` for reproducible builds
- Review the override's `additionalDirectories` list — anything mounted there is reachable by the agent
- Audit the list of Claude Code plugins enabled in the override before publishing screenshots or sharing the container

## Acknowledgments

A list of researchers who have reported valid issues will appear in this section after the first valid disclosure. Thank you in advance for responsible reporting.
