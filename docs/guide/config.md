# Configuration

Kibaco stores the project-local config at `.kibaco/config.json`. This file is developer-specific local state and should not be committed.

Commit `kibaco.config.example.json` and the JSON Schema so humans, AI coding assistants, and editors can understand the expected shape without sharing private local ports or commands.

```json
{
  "$schema": "https://kibaco.dev/schemas/kibaco.config.schema.json",
  "workspace": "my-app",
  "proxyPort": 8080,
  "services": [
    {
      "name": "postgres",
      "image": "postgres:16",
      "ports": ["5432:5432"],
      "env": {
        "POSTGRES_PASSWORD": "postgres",
        "POSTGRES_DB": "app"
      },
      "healthCheck": {
        "type": "tcp",
        "host": "127.0.0.1",
        "port": 5432
      }
    }
  ],
  "projects": [
    {
      "name": "web",
      "host": "web.localhost",
      "target": "http://localhost:3000",
      "command": "pnpm dev",
      "cwd": ".",
      "services": ["postgres"]
    }
  ]
}
```

## Discovery order

Kibaco checks config files in this order:

1. `./.kibaco/config.json`
2. `./kibaco.config.json`
3. Registered fallback config under `~/.kibaco/workspaces/...`

Run `kibaco explain` to show exactly which file Kibaco found.

## Git ignore

`kibaco init` adds these entries to `.gitignore` when missing:

```text
.kibaco/
kibaco.config.json
```

## Repo-local overrides

Add `kibaco.yaml`, `kibaco.yml`, or `kibaco.json` at the workspace root to override the stored config without rerunning `kibaco init`.

```yaml
proxyPort: 18080
projects:
  - name: web
    target: http://localhost:4000
    command: pnpm dev -- --port 4000
services:
  - name: postgres
    env:
      POSTGRES_DB: local_app
```

Projects and services are merged by `name`, so a repo-local file can override just the fields that differ.

## AI-safe commands

Use these commands before editing JSON by hand:

```bash
kibaco config validate
kibaco config format
kibaco config list-routes
kibaco config set-target web http://localhost:3004
kibaco explain
```

When a route such as `http://web.localhost:8080` fails, check `kibaco config list-routes` and `kibaco config validate` before looking for Caddy, nginx, docker-compose, or system proxy settings.

## Projects

Each project describes one local app process and the URL Kibaco should expose.

- `name`: Project name used by commands such as `kibaco open web`
- `host`: Local hostname handled by the proxy
- `target`: Local server URL started by the project command
- `command`: Shell command for the app process
- `cwd`: Working directory for the command
- `services`: Docker service names that should be started before the project

## Services

Services are Docker containers managed by Kibaco.

- `name`: Service name referenced by projects
- `image`: Docker image
- `ports`: Docker port mappings
- `env`: Environment variables passed to the container
- `volumes`: Docker volume mappings
- `dependsOn`: Services to start first
- `healthCheck`: Optional readiness check
