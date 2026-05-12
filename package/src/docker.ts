import { ExecaError, execa } from "execa";
import { join } from "node:path";

export async function assertDockerAvailable(): Promise<void> {
  try {
    await execa("docker", ["info"], {
      timeout: 3000,
      stdio: "ignore",
    });
  } catch (err) {
    if (err instanceof ExecaError && err.timedOut) {
      throw new Error(
        "Docker daemon did not respond within 3 seconds. Is Docker Desktop / colima running?",
      );
    }
    throw new Error(
      "Docker daemon not reachable. Start Docker Desktop / colima and retry.",
    );
  }

  let composeVersion: string;
  try {
    const result = await execa("docker", ["compose", "version", "--short"], {
      timeout: 3000,
    });
    composeVersion = result.stdout.trim();
  } catch (err) {
    if (err instanceof ExecaError && err.timedOut) {
      throw new Error(
        "`docker compose version` did not respond within 3 seconds.",
      );
    }
    throw new Error(
      "Requires Docker Compose v2 (docker compose). Could not detect version.",
    );
  }

  const normalized = composeVersion.startsWith("v")
    ? composeVersion.slice(1)
    : composeVersion;
  const majorPart = normalized.split(".")[0] ?? "";
  const major = Number.parseInt(majorPart, 10);
  if (!Number.isFinite(major) || major < 2) {
    throw new Error(
      `Requires Docker Compose v2 or newer. Found '${composeVersion}'; please upgrade.`,
    );
  }
}

function composeFlags(vibeDir: string): string[] {
  return [
    "compose",
    "-f",
    join(vibeDir, "docker-compose.sandbox.yml"),
    "-f",
    join(vibeDir, "docker-compose.override.yml"),
  ];
}

export async function composeBuild(vibeDir: string): Promise<void> {
  // The override's `FROM sandbox-vibe-base:latest` depends on the base image
  // existing locally. Build the base alone first, then the override on top.
  await execa(
    "docker",
    [
      "compose",
      "-f",
      join(vibeDir, "docker-compose.sandbox.yml"),
      "build",
    ],
    { stdio: "inherit" },
  );
  await execa("docker", [...composeFlags(vibeDir), "build"], {
    stdio: "inherit",
  });
}

export async function composeRun(vibeDir: string): Promise<void> {
  await execa(
    "docker",
    [...composeFlags(vibeDir), "run", "--rm", "sandbox"],
    {
      stdio: "inherit",
    },
  );
}
