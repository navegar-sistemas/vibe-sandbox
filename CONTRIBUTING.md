# Contributing to sandbox-vibe

Thanks for considering a contribution. This template stays small on purpose — that is the value proposition. Before opening a PR, please read this document.

## Ground rules

- **The base must stay generic.** Anything tied to a specific project, plugin, runtime, or absolute path belongs in the override files (which are gitignored), not in `Dockerfile.sandbox` or `docker-compose.sandbox.yml`.
- **Security defaults are non-negotiable.** `cap_drop: ALL`, non-root user, `no-new-privileges`, `network_mode: bridge`, and the resource limits exist for a reason. Removing or weakening any of them requires a written justification in the PR description and an update to the README's "Security defaults" section.
- **Bootstrap idempotency must hold.** If you change the marker (`~/.claude/.bootstrap-v1`) or the operations gated by it, you must verify that running the container twice produces the same end state with no duplicate work.
- **Slim image, slim base.** Adding a tracked `apt-get install` requires a justification that holds for every user of the template. If only some users need it, it goes into the `.example` override.

## Reporting issues

- **Bugs** → open an issue with the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml). Include Docker version, host OS, Claude Code version, and reproduction steps.
- **Features** → open an issue with the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml). Describe the problem first; the proposed solution is secondary.
- **Questions / "is this the right approach?"** → please use [GitHub Discussions](https://github.com/navegar-sistemas/sandbox-vibe/discussions) instead of issues.
- **Security vulnerabilities** → see [SECURITY.md](SECURITY.md). Do **not** open a public issue.

## Pull request flow

1. Fork the repo and create a feature branch from `main`.
2. Make focused changes. One PR = one logical change. Splitting into smaller PRs is almost always better than bundling.
3. Ensure the CI workflow passes locally before pushing:

   ```bash
   docker compose -f docker-compose.sandbox.yml config
   hadolint Dockerfile.sandbox Dockerfile.sandbox.override.example
   markdownlint-cli2 "**/*.md"
   gitleaks detect --source . --no-git
   docker compose -f docker-compose.sandbox.yml build
   ```

4. Update the README, CHANGELOG, and any relevant docs in the same PR. Documentation is part of the change, not a follow-up.
5. Open the PR using the [pull request template](.github/PULL_REQUEST_TEMPLATE.md). Fill in every section honestly.
6. CI must pass. A maintainer will review.

## Commit messages — Conventional Commits

This repo uses [Conventional Commits 1.0.0](https://www.conventionalcommits.org/). Format:

```text
<type>(<optional scope>): <short imperative summary>

<optional body explaining why, not what>

<optional footer with BREAKING CHANGE: ... or refs>
```

**Types we use:**

| Type | When to use |
| --- | --- |
| `feat` | New capability for users of the template (new option, new variable, new optional block) |
| `fix` | Bug fix (compose syntax, broken bootstrap, security regression) |
| `docs` | README, CONTRIBUTING, CHANGELOG, code comments |
| `chore` | Tooling, CI config, dependabot, repo hygiene |
| `refactor` | Internal change with no observable behavior difference |
| `ci` | Changes to `.github/workflows/` |
| `build` | Changes to Dockerfile structure or build pipeline |

**Examples:**

```text
feat(override): add optional Bun runtime block
fix(bootstrap): escape $$BOOT_LOG so compose stops warning about empty var
docs(readme): document marker bumping for plugin list changes
chore(deps): bump node base image to 24.6-slim
```

A `BREAKING CHANGE:` footer is required if the change forces existing users to bump the bootstrap marker, change their override structure, or rebuild the base image.

## Branch protection on `main`

`main` is protected. You cannot push directly. Every change goes through a PR. CI must pass and at least one approving review is required before merging.

## Releasing

Releases follow [Semantic Versioning 2.0.0](https://semver.org). Changes are kept in [CHANGELOG.md](CHANGELOG.md) under `## [Unreleased]` until a tag is cut. A maintainer creates the tag and a GitHub Release; users tracking `main` should pin to a tag.

## Local development tools

Optional but highly recommended:

- [Docker](https://docs.docker.com/engine/install/) ≥ 24.0
- [hadolint](https://github.com/hadolint/hadolint) for Dockerfile linting
- [markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2) for Markdown linting
- [gitleaks](https://github.com/gitleaks/gitleaks) for secret scanning

On macOS:

```bash
brew install hadolint markdownlint-cli2 gitleaks
```

## Questions

If anything in this document is unclear, that's a doc bug. Open an issue with the `documentation` label or a PR fixing it.
