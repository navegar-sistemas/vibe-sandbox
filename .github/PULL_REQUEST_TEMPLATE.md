<!--
Thanks for the contribution. Please fill in every section honestly. PRs with empty sections will be asked to update before review.
-->

## Summary

<!-- One or two sentences describing the change. What does this PR do? -->

## Motivation

<!-- Why is this change necessary? Link the issue it fixes (Fixes #123) or the discussion it resolves. -->

## Type of change

<!-- Check all that apply. Conventional Commits prefix should match the type of change. -->

- [ ] `feat` — new capability for users of the template
- [ ] `fix` — bug fix
- [ ] `docs` — documentation only (README, CHANGELOG, comments)
- [ ] `chore` — tooling, CI, dependabot, repo hygiene
- [ ] `refactor` — internal change without observable behavior difference
- [ ] `ci` — `.github/workflows/` changes
- [ ] `build` — Dockerfile or build pipeline change
- [ ] **Breaking change** — requires marker bump or override migration

## Layer affected

<!-- Where does the change live? -->

- [ ] Base (`Dockerfile.sandbox`, `docker-compose.sandbox.yml`) — affects every user
- [ ] Override example (`*.override.example`) — template only
- [ ] Documentation (`README.md`, `CONTRIBUTING.md`, `.claude/CLAUDE.md`, `SECURITY.md`, `CHANGELOG.md`)
- [ ] CI / `.github/`

## How was it tested?

<!-- Provide reproducible commands. "I ran the CI" is not enough. -->

```bash
# Examples — replace with what you actually ran
docker compose -f docker-compose.sandbox.yml config
hadolint Dockerfile.sandbox
docker compose -f docker-compose.sandbox.yml build
docker compose -f docker-compose.sandbox.yml run --rm sandbox bash -c 'node --version'
```

Output / observed behavior:

<!-- Paste relevant output, or describe what you observed. -->

## Checklist

- [ ] Read [`CONTRIBUTING.md`](../CONTRIBUTING.md)
- [ ] Commit messages follow Conventional Commits
- [ ] CI passes locally (hadolint, `docker compose config`, markdownlint, gitleaks, build)
- [ ] `README.md` updated if user-visible behavior changed
- [ ] `CHANGELOG.md` updated under `## [Unreleased]`
- [ ] If a security default was changed: trade-off documented in PR description and `README.md` "Security defaults" section
- [ ] If the bootstrap marker was changed: every reference to `bootstrap-vN` was bumped consistently
- [ ] No absolute paths, credentials, or project-specific content added to tracked files
- [ ] Docs reference `navegar-sistemas/sandbox-vibe` rather than a personal fork
