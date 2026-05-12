# Manual setup

Use this path when you want full control over the sandbox files and do not want to install the CLI. The CLI in [`package/`](../package/) automates everything below; the manual path is exactly the same template, edited by hand.

---

## 1. Clone or use as a template

```bash
git clone https://github.com/navegar-sistemas/sandbox-vibe.git
cd sandbox-vibe
```

Or use the repository as a [GitHub template](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template).

---

## 2. Generate the local override files

```bash
cp Dockerfile.sandbox.override.example  Dockerfile.sandbox.override
cp docker-compose.override.example.yml  docker-compose.override.yml
```

Both new files are listed in `.gitignore` — edit them freely without leaking absolute paths or credentials.

---

## 3. Edit `docker-compose.override.yml`

Minimum required: a workspace bind mount.

```yaml
volumes:
  - sandbox-home:/home/sandbox
  - /Users/YOUR_USER/path/to/your-project:/workspace        # edit this
```

### Multiple sibling projects

If your work spans multiple repositories that need to be visible inside the same container, mount each one and expose them through `additionalDirectories`:

```yaml
volumes:
  - sandbox-home:/home/sandbox
  - /Users/YOUR_USER/path/to/main-project:/workspace
  - /Users/YOUR_USER/path/to/api:/workspace/api
  - /Users/YOUR_USER/path/to/worker:/workspace/worker
```

```yaml
"additionalDirectories": [
  "/workspace",
  "/workspace/api",
  "/workspace/worker"
]
```

Claude Code will see all three as accessible directories.

---

## 4. Build and run

```bash
docker compose -f docker-compose.sandbox.yml build --no-cache && \
  docker compose -f docker-compose.sandbox.yml -f docker-compose.override.yml build --no-cache
```

```bash
docker compose -f docker-compose.sandbox.yml -f docker-compose.override.yml run --rm sandbox
```

The first run executes the bootstrap (installs marketplaces, plugins, and MCPs into the volume). Subsequent runs drop straight into the Claude REPL in milliseconds; bootstrap is recorded by the marker `~/.claude/.bootstrap-v1` and skipped from then on.

---

## When to bump the marker

If you add or remove plugins / MCPs / marketplaces in the entrypoint *after* the sandbox has run at least once, the marker file is already present and the bootstrap will be skipped. Bump the marker number to force a re-bootstrap:

1. Open `docker-compose.override.yml`.
2. Replace every occurrence of `bootstrap-v1` with `bootstrap-v2` (and so on).
3. Run `up` again.

The CLI handles this automatically by deriving the marker from a hash of the configuration; the manual path requires you to remember.

---

## See also

- [Customization](customization.md) — add a language server, add an MCP, change resource limits.
- [Architecture](architecture.md) — what each phase of the bootstrap does and why.
- [Troubleshooting](troubleshooting.md) — common error messages and root causes.
