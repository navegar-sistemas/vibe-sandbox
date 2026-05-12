---
description: Run all local linters and validations for the sandbox-vibe template
allowed-tools: Bash(docker compose:*), Bash(hadolint:*), Bash(markdownlint-cli2:*), Bash(gitleaks:*), Bash(cp:*), Bash(rm:*), Bash(which:*)
argument-hint: (no arguments)
---

You are validating the sandbox-vibe template locally. Run every step below in sequence, capturing the output. Do **not** stop on first failure — collect every result and report at the end.

## Steps

For each step: announce the command, run it, show its exit code, and keep the last 20 lines of output for the final summary.

1. **Compose syntax — base only**
   `docker compose -f docker-compose.sandbox.yml config --quiet`

2. **Compose merge — base + override.example**
   Copy `docker-compose.override.example.yml` to a temp file, merge-validate it, then remove the temp:

   ```bash
   cp docker-compose.override.example.yml /tmp/sandbox-vibe-validate-override.yml
   docker compose -f docker-compose.sandbox.yml -f /tmp/sandbox-vibe-validate-override.yml config --quiet
   rm /tmp/sandbox-vibe-validate-override.yml
   ```

   Any "variable is not set" warning is a defect (typically a `$VAR` in the entrypoint not escaped as `$$VAR`); the step must be marked FAIL when such a warning appears, regardless of compose's exit code. The repository treats warnings as defects of the same severity as errors.

3. **Hadolint — Dockerfile.sandbox**
   `hadolint Dockerfile.sandbox`

4. **Hadolint — Dockerfile.sandbox.override.example**
   `hadolint Dockerfile.sandbox.override.example`

5. **Markdownlint**
   `markdownlint-cli2 "**/*.md"`

6. **Gitleaks**
   `gitleaks detect --source . --no-git`

## Tool-missing handling

If `command -v <tool>` returns nothing, mark the step `TOOL MISSING` and tell the user to install it:

| Tool | macOS install |
| --- | --- |
| hadolint | `brew install hadolint` |
| markdownlint-cli2 | `brew install markdownlint-cli2` |
| gitleaks | `brew install gitleaks` |
| docker | install Docker Desktop |

`TOOL MISSING` is not the same as PASS — list it in the summary so the user sees what was skipped.

## Final summary (always print)

```text
| # | Step                                  | Status     |
|---|---------------------------------------|------------|
| 1 | Compose base                          | PASS / FAIL / TOOL MISSING |
| 2 | Compose merge with override.example   | ... |
| 3 | Hadolint base                         | ... |
| 4 | Hadolint override example             | ... |
| 5 | Markdownlint                          | ... |
| 6 | Gitleaks                              | ... |
```

Then a numbered list of every FAIL with file:line and a one-line proposed fix. If all pass, print `ALL PASS — safe to commit.`
