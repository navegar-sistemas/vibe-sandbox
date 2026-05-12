# sandbox-vibe tracked compose.
# Defines the base image and the security/resource limits that apply to any project.
# Project volumes, plugins, MCPs and a custom entrypoint go in docker-compose.override.yml.

services:
  sandbox:
    image: sandbox-vibe-base:latest
    build:
      context: .
      dockerfile: Dockerfile.sandbox
    working_dir: /workspace
    stdin_open: true
    tty: true
    deploy:
      resources:
        limits:
          cpus: "${cpus}"
          memory: ${memoryGB}G
          pids: ${pids}
        reservations:
          cpus: "1"
          memory: 512M
    tmpfs:
      - /tmp:size=${tmpfsMB}M
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    network_mode: bridge
