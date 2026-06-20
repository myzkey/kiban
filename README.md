# Kibaco

[日本語版 README](./README.ja.md)

Kibaco starts your local development environment with one command.

It keeps app commands, local URLs, reverse proxy routing, and Docker services in Kibaco's workspace config under `~/.kibaco`, so your project directory stays clean.

Documentation: https://myzkey.github.io/kibaco/

## What You Can Do

- Start all app processes with `kibaco dev`
- Open stable local URLs such as `http://web.localhost:8080`
- Start dependent Docker services before app commands
- Reuse an already-running Kibaco proxy
- Inspect ports, services, and project targets with `kibaco doctor`
- Stop app processes with `Ctrl+C` while keeping databases running

## Quick Start

Create a config in your project directory:

```sh
kibaco init
```

Kibaco infers sensible defaults from package managers, `package.json`, dev scripts, `.env` ports, common frameworks, simple backend/server files, monorepo app folders, and Compose files when it can.
It prefers proxy port `8080`, but `kibaco init` automatically chooses another available proxy port when that would conflict with a project target or a local process.

Then start the environment:

```sh
kibaco dev
```

Open a project URL:

```sh
kibaco open web
```

That is the normal daily workflow. `kibaco dev` starts the Docker services used by your projects, runs each project command, and starts the local reverse proxy.

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
      "services": ["postgres"]
    }
  ]
}
```

With this config, `kibaco dev` makes these URLs available:

```text
http://web.localhost:8080
http://api.localhost:8080
```

## Daily Commands

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
```

Check the active config, proxy port, Docker availability, service references, project working directories, and target reachability.

```sh
kibaco list
```

Show configured projects and their URLs.

```sh
kibaco urls
```

Show only the configured local URLs.

```sh
kibaco ports
```

Show local listening ports and match them to configured projects when possible.

```sh
kibaco logs
kibaco logs web --follow
kibaco logs mysql
```

Show project logs captured from `kibaco dev`, or Docker service logs when the name matches a configured service. Run `kibaco logs` without a name to choose from configured projects and services. Kibaco stores per-project text logs and structured JSONL logs under `~/.kibaco/logs/{workspace}`.

```sh
kibaco restart web
```

Restart a project process managed by the running `kibaco dev`.

```sh
kibaco open web
```

Open a project through its configured local URL.

## Docker Services

When a project lists services, Kibaco starts those containers before running the app command and waits for health checks when configured.
Services inferred from a Compose file are managed through `docker compose`, so `.env`, `env_file`, variable substitution, networks, and volumes follow Docker Compose behavior.

```sh
kibaco services up
kibaco services restart postgres
kibaco services status
kibaco services logs postgres --tail 200 --follow
kibaco services down
```

`Ctrl+C` in `kibaco dev` stops the project processes and the proxy started by Kibaco. Docker services are left running so databases stay available during development. Stop them explicitly with `kibaco services down`.

## Proxy Only

Use `kibaco proxy` when your app processes are already running and you only want Kibaco's URL routing:

```sh
kibaco proxy
```

If a Kibaco proxy is already running on `proxyPort`, `kibaco dev` reuses it. If another process is using the port, Kibaco shows a port conflict message with a `kibaco kill-port` suggestion.

## Override Init Defaults

`kibaco init` infers defaults when it can. Override values only when needed:

```sh
kibaco init --project web --host web.localhost --target http://localhost:3000 --cmd "pnpm dev"
```

Preview inferred config without saving it:

```sh
kibaco init --detect
```

Force an interactive review:

```sh
kibaco init --interactive
```

Init can detect common setups:

- Package managers: pnpm, npm, yarn, bun
- Frontend frameworks: Next.js, Vite, Astro, Nuxt, Remix
- Backend projects: Rails, Laravel, Django, Go, Rust, simple Node servers
- Monorepos: `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `apps/*`, `packages/*`, `services/*`
- Environment ports: `.env`, `.env.local`, `.env.development`
- Compose services: images, ports, environment, volumes, dependencies, and common health checks

## Troubleshooting

Run:

```sh
kibaco doctor
```

Common fixes:

- Port conflict: `kibaco kill-port 8080 --force`
- Stop Docker services: `kibaco services down`
- Check service logs: `kibaco services logs postgres --follow`
- Use port 80 URLs without `:8080`: set `"proxyPort": 80` and run with permission to bind port 80

## Install

After release, install Kibaco from npm:

```sh
npm install -g kibaco
```

For local development from source:

```sh
asdf install
node --version # v24 or newer
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
