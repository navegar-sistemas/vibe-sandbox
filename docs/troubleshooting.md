# Troubleshooting

Common errors, what they mean, and the root cause to fix. The repository treats warnings as defects of the same severity as errors; suppressing a warning without addressing the cause is not a valid resolution.

---

## `warning: skip creation of /usr/share/man/man1/...lzma...`

The warning comes from `xz-utils` on slim Debian images that omit the man-page hierarchy. The base image deliberately does not install `xz-utils` for this reason. If you added it in the override, eliminate the warning by creating `/usr/share/man/man1/` *before* the `apt-get install`:

```dockerfile
RUN mkdir -p /usr/share/man/man1 \
    && apt-get update \
    && apt-get install -y --no-install-recommends xz-utils \
    && rm -rf /var/lib/apt/lists/*
```

Accepting the warning silently is not a valid resolution — see the warnings-as-errors rule in `.claude/CLAUDE.md`.

---

## `The variable is not set. Defaulting to a blank string`

Compose interpolates `$VAR` in YAML strings before bash sees them. If you added a bash variable to the entrypoint, you must escape it with `$$VAR` (two dollar signs) so Compose passes it through verbatim.

This applies to `$p` in the plugin install loop, `$BOOT_LOG`, and any other shell variable that appears inside a YAML string. The two-dollar escape is the convention in `package/templates/docker-compose.override.yml.tpl` and in `docker-compose.override.example.yml` — copy the pattern from there if in doubt.

---

## `Tool 'csharp-ls' failed to install... DotnetToolSettings.xml`

The current `csharp-ls` requires .NET 10 or newer. If you uncommented the .NET block in `Dockerfile.sandbox.override`, make sure `dotnet-install.sh` is invoked with `--channel 10.0`, not an older channel.

---

## Bootstrap ran but plugins are missing

Confirm that the plugin names in the `for p in ...` loop **exactly** match the entries in `enabledPlugins` inside `settings.json`. Both lists must use the same `name@marketplace` form. A plugin that is enabled but not installed is reported as missing on startup; a plugin that is installed but not enabled is silently absent.

---

## Bootstrap was skipped but I changed the list

The marker file `~/.claude/.bootstrap-v1` (or the hashed equivalent if you used the CLI) lives inside the per-project home volume. Once it exists, the bootstrap phase is skipped on every subsequent run.

**CLI path:** the marker is derived from a hash of the configuration. Editing `config.json` changes the hash, which produces a new marker name, which triggers a fresh bootstrap automatically. No manual step required.

**Manual path:** bump the marker by hand. Replace `bootstrap-v1` with `bootstrap-v2` everywhere in `docker-compose.override.yml`, then run `up`. To force a re-bootstrap without editing the file, delete the marker:

```bash
docker compose -f docker-compose.sandbox.yml -f docker-compose.override.yml run --rm \
  --entrypoint bash sandbox -c 'rm -f ~/.claude/.bootstrap-v1'
```

---

## The image is huge

The .NET SDK 10 alone adds roughly 250 MB. If you only need `csharp-ls` at runtime and not the full SDK, keep the SDK install — `dotnet tool install -g csharp-ls` requires it. The lightweight LSPs (`intelephense`, `pyright`) cost only a few megabytes each.

If you do not use C# / .NET at all, comment the entire `.NET` block out of `Dockerfile.sandbox.override` and rebuild.

---

## CLI fails with `Cannot find module '/Users/.../sistem'`

This is a path-with-spaces issue. The CLI accepts paths with spaces, but your shell may be splitting the argument before it reaches Node. Quote the path:

```bash
npx sandbox-vibe init --workspace "/Users/me/My Projects/foo"
```

---

## CLI complains about Compose version

```text
[sandbox-vibe] Requires Docker Compose v2 or newer. Found '5.1.3'; please upgrade.
```

Despite the message wording, version `5.1.3` (or any version with major ≥ 2) is accepted. If you see this error with a newer Compose, run `docker compose version` and ensure it reports a version starting with a digit ≥ 2 — Compose v1 (`docker-compose`, with the hyphen) is not supported.

---

## See also

- [Architecture](architecture.md) — bootstrap phases, marker behavior, security defaults.
- [Customization](customization.md) — how to add language servers, MCPs, and runtimes correctly.
- [Manual setup](manual-setup.md) — manual template flow.
