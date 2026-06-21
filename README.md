# Kibaco

[日本語版 README](./README.ja.md)

Kibaco is an AI-friendly local development environment manager.

It is not a Docker replacement. Kibaco sits above Docker Compose and local app processes, then gives your team one command, stable local URLs, logs, and a structured view of the whole environment.

Documentation: https://myzkey.github.io/kibaco/

## Problems Kibaco Solves

Modern development environments commonly include:

- Next.js
- Vite
- API servers
- Workers
- PostgreSQL
- Redis
- MinIO

Every day, developers repeat the same setup work:

- Start Docker
- Start the API
- Start the web app
- Start workers
- Check ports
- Check URLs

Each project has its own startup steps. You have to remember which terminal started which process, which service stopped, and which URL to use.

Kibaco manages this in one workspace config and starts the whole local development environment with one command.

## What Is Kibaco?

Kibaco is a CLI for managing local development environments.

It stores app commands, local URLs, reverse proxy routing, logs, Docker services, and health checks in a developer-local `.kibaco/config.json`, while `kibaco.config.example.json` and the JSON Schema can be committed for teammates and AI tools.

Kibaco is positioned as a local development environment manager for the AI era:

- Simple by default
- One-command daily workflow
- Stable URL management
- Docker Compose integration
- Structured environment output that can be shared with AI tools and teammates

## Before / After

Before:

```sh
docker compose up -d

cd apps/web
pnpm dev

cd apps/api
pnpm dev

cd apps/worker
pnpm dev
```

After:

```sh
kibaco dev
```

## Relationship With Docker

Kibaco is not an alternative to Docker.

Docker Compose manages containers. Kibaco manages the whole development environment, including Docker containers and local processes.

| Tool           | Responsibility                     |
| -------------- | ---------------------------------- |
| Docker Compose | Container Management               |
| Kibaco         | Development Environment Management |

When a project lists Docker services, Kibaco starts those containers before app commands and waits for configured health checks. Services inferred from Compose files are managed through `docker compose`, so `.env`, `env_file`, variable substitution, networks, and volumes follow Docker Compose behavior.

## AI-Friendly

Kibaco provides a structured view of the local development environment.

Example:

```sh
kibaco doctor
```

Output:

```text
PostgreSQL: running
Redis: running
Web: http://web.localhost:8080
API: http://api.localhost:8080
Worker: stopped
```

You can also export machine-readable status:

```sh
kibaco doctor --json
```

Example:

```json
{
  "workspace": "my-app",
  "proxyPort": 8080,
  "services": [
    {
      "name": "postgres",
      "status": "running"
    }
  ],
  "projects": [
    {
      "name": "web",
      "status": "running",
      "url": "http://web.localhost:8080",
      "target": "http://localhost:3000"
    }
  ],
  "issues": []
}
```

This makes it easier to share the current environment state with AI tools or teammates without explaining each terminal and port manually.

## Main Features

- Start services, project commands, and the local reverse proxy with `kibaco dev`
- Open stable local URLs such as `http://web.localhost:8080`
- Start Docker services before app commands
- Reuse an already-running Kibaco proxy
- Inspect ports, services, projects, and target reachability with `kibaco doctor`
- Explain local config discovery and routes with `kibaco explain`
- Validate, format, list, and safely edit routes with `kibaco config ...`
- Print structured status with `kibaco doctor --json`
- Export a shareable environment view with `kibaco export`
- Store project logs under `~/.kibaco/logs/{workspace}`
- View logs with `kibaco logs web` and follow them with `kibaco logs web --follow`
- Open a project URL with `kibaco open web`
- List available URLs with `kibaco open`
- Stop app processes with `Ctrl+C` while keeping databases running

## Quick Start

Create a config in your project directory:

```sh
kibaco init
```

Kibaco infers sensible defaults from package managers, `package.json`, dev scripts, `.env` ports, common frameworks, simple backend/server files, monorepo app folders, and Compose files when it can.

It prefers proxy port `8080`, but `kibaco init` automatically chooses another available proxy port when that would conflict with a project target or a local process.

`kibaco init` writes local config to `.kibaco/config.json`, adds `.kibaco/` and `kibaco.config.json` to `.gitignore`, and writes a committable `kibaco.config.example.json`.

Explain what Kibaco manages in this project:

```sh
kibaco explain
```

Start the environment:

```sh
kibaco dev
```

List available URLs:

```sh
kibaco open
```

Open a project URL:

```sh
kibaco open web
```

## Example Config

Kibaco stores the workspace config outside the project, under `~/.kibaco`. Conceptually, the config looks like this:

```json
{
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
    },
    {
      "name": "redis",
      "image": "redis:7",
      "ports": ["6379:6379"],
      "dependsOn": ["postgres"],
      "healthCheck": {
        "type": "tcp",
        "host": "127.0.0.1",
        "port": 6379
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
    },
    {
      "name": "api",
      "host": "api.localhost",
      "target": "http://localhost:8787",
      "command": "pnpm dev:api",
      "cwd": ".",
      "services": ["postgres", "redis"]
    }
  ]
}
```

With this config, `kibaco dev` makes these URLs available:

```text
http://web.localhost:8080
http://api.localhost:8080
```

Health checks currently support TCP, HTTP, and command probes:

```json
{
  "healthCheck": {
    "type": "http",
    "url": "http://localhost:3000/health"
  }
}
```

## Commands

```sh
kibaco dev
kibaco dev web
kibaco dev --select
kibaco dev --verbose
```

Start services, project commands, and the proxy together. With no project names, Kibaco starts all configured projects and their referenced services.

Project stdout/stderr is written to log files but is not streamed to the terminal by default. Use `--verbose` when you want to stream project logs inline.

```sh
kibaco doctor
kibaco doctor --json
kibaco status
kibaco status --json
```

Check the active config, proxy port, Docker availability, service references, project working directories, service status, project URLs, and target reachability. Use `status` for a compact current-state view.

```sh
kibaco list
kibaco list --json
```

Show configured projects and their URLs.

```sh
kibaco urls
kibaco urls --json
```

Show only the configured local URLs.

```sh
kibaco open
kibaco open web
```

List available URLs, or open one project through its configured local URL.

```sh
kibaco export
```

Print a shareable JSON view of services, projects, commands, and URLs.

```sh
kibaco ports
kibaco ports --json
```

Show local listening ports and match them to configured projects when possible.

```sh
kibaco logs
kibaco logs web
kibaco logs web --follow
kibaco logs api --tail 200
kibaco logs postgres --service --follow
```

Show project logs captured from `kibaco dev`, or Docker service logs when the name matches a configured service.

```sh
kibaco restart web
kibaco restart --all
```

Restart project processes managed by the running `kibaco dev`.

```sh
kibaco services up
kibaco services restart postgres
kibaco services status
kibaco services logs postgres --tail 200 --follow
kibaco services down
```

Manage Docker services for the current workspace.

```sh
kibaco proxy
```

Start only the local reverse proxy.

```sh
kibaco kill-port 8080 --force
```

Kill the process listening on a port.

## Roadmap

High priority:

- `dependsOn` for project startup order, such as starting Worker after API or E2E after Web
- richer `healthCheck` usage for startup completion
- richer export output with live status for AI tools or teammates
- richer `logs` and `open` workflows

Medium priority:

- watch mode
- restart policy
- auto recovery
- startup time measurement

Low priority:

- TUI
- Web Dashboard
- VSCode Extension
- MCP Server

Kibaco intentionally avoids Kubernetes-style complexity. The goal is simple, reliable, local development environment management.

## Install

After release, install Kibaco from npm:

```sh
npm install -g kibaco
```

For local development from source:

```sh
asdf install
node --version # v22.12.0 or newer
pnpm install
pnpm build
pnpm link --global
```

To switch between the published npm package and this checkout's global link:

```sh
pnpm switch:status
pnpm switch:local
pnpm switch:npm
```

To install a specific published version:

```sh
KIBACO_NPM_VERSION=0.0.1 pnpm switch:npm
```

## Security

Kibaco runs commands from its workspace config. Only initialize workspaces that you trust.
