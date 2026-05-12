---
description: Build the sandbox-vibe base image and run a functional smoke test
allowed-tools: Bash(docker compose:*), Bash(docker run:*), Bash(docker images:*)
argument-hint: (no arguments)
---

You are smoke-testing the sandbox-vibe base image. Goal: prove that the image builds, the `sandbox` non-root user is in place, required tools are on PATH, and the documented security defaults are actually applied at runtime.

## Steps

Run each in sequence. Do not skip on first failure — collect all results.

1. **Build**
   `docker compose -f docker-compose.sandbox.yml build`
   Any warning emitted by buildkit constitutes a build defect; the smoke test must FAIL if buildkit emits a warning, regardless of the build's exit code. Note the final image size.

2. **Tools on PATH** — required runtimes/utilities are reachable from the default user:

   ```bash
   docker run --rm --entrypoint bash sandbox-vibe-base:latest -c '
     set -e
     node --version
     git --version
     python3 --version
     curl --version | head -n 1
   '
   ```

   Each command must print a non-empty version string.

3. **Non-root user** — the container runs as `sandbox`, not root:

   ```bash
   docker run --rm --entrypoint bash sandbox-vibe-base:latest -c 'id -un'
   ```

   Output must equal `sandbox`. Anything else is a regression.

4. **Security defaults applied at runtime** — when the container is invoked with the same flags `docker-compose.sandbox.yml` ships with:

   ```bash
   docker run --rm \
     --user 1000:1000 \
     --cap-drop=ALL \
     --security-opt=no-new-privileges:true \
     --pids-limit=256 \
     sandbox-vibe-base:latest \
     bash -c 'cat /proc/self/status | grep -E "^(CapEff|NoNewPrivs)"'
   ```

   Required output:
   - `NoNewPrivs:` followed by `1`
   - `CapEff:` followed by `0000000000000000` (all 16 zeros — every capability dropped)

   Anything else means a security regression and the build must FAIL.

5. **Image size sanity check**
   `docker images sandbox-vibe-base:latest --format '{{.Size}}'`
   Note the size. If it grew significantly without an explanation in the diff, flag it (the base is supposed to stay slim — see .claude/CLAUDE.md "Slim and minimum-purpose").

## Final summary

Table of step / PASS or FAIL / observed value. If every step passes, print:

```text
SMOKE OK — base image is functional and security-correct.
Image: sandbox-vibe-base:latest
Size : <size>
User : sandbox
```

For any FAIL, propose a root-cause hypothesis: missing apt package, broken Dockerfile RUN ordering, security default removed from the compose file, etc.
