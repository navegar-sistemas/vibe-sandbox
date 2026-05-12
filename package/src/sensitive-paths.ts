import { homedir } from "node:os";

// Mounting any of these paths exposes host credentials, secrets, or system
// state to the agent inside the container (which runs `claude
// --dangerously-skip-permissions` against `additionalDirectories`). The
// wizard does not block them — it asks for explicit confirmation so a
// careless mount is not accepted by default. Detection is exported so
// it can be exercised by tests without going through the inquirer wizard.
// Includes both the conventional Linux locations and the macOS firmlinks
// that `realpathSync` resolves to (e.g. `/etc` -> `/private/etc`). Without
// the `/private/*` entries the sensitive check silently passes through on
// macOS after realpath resolution.
export const SENSITIVE_SYSTEM_PATHS: readonly string[] = [
  "/",
  "/etc",
  "/private/etc",
  "/root",
  "/var",
  "/private/var",
  "/sys",
  "/proc",
  "/usr",
  "/boot",
  "/dev",
];

export const SENSITIVE_HOME_SUBDIRS: readonly string[] = [
  ".ssh",
  ".aws",
  ".gnupg",
  ".docker",
  ".kube",
  ".config/gh",
  ".npmrc",
];

export function isSensitivePath(absolutePath: string): boolean {
  if (SENSITIVE_SYSTEM_PATHS.includes(absolutePath)) return true;
  for (const sys of SENSITIVE_SYSTEM_PATHS) {
    // Treat any subpath of a system root (e.g. `/etc/foo`) the same way.
    if (sys !== "/" && absolutePath.startsWith(`${sys}/`)) return true;
  }
  const home = homedir();
  for (const suffix of SENSITIVE_HOME_SUBDIRS) {
    const sensitive = `${home}/${suffix}`;
    if (absolutePath === sensitive || absolutePath.startsWith(`${sensitive}/`)) {
      return true;
    }
  }
  return false;
}
