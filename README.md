# Kiban

[日本語版 README](./README.ja.md)

Kiban starts your local development environment with one command.

It keeps app commands, local URLs, reverse proxy routing, and Docker services in one `kiban.config.json`, so you do not have to remember which terminal, port, or container belongs to each project.

Documentation: https://myzkey.github.io/kiban/

## What You Can Do

- Start all app processes with `kiban dev`
- Open stable local URLs such as `http://web.localhost:8080`
- Start dependent Docker services before app commands
- Reuse an already-running Kiban proxy
- Inspect ports, services, and project targets with `kiban doctor`
- Stop app processes with `Ctrl+C` while keeping databases running

## Quick Start

Create a config in your project directory:

```sh
kiban init
```

Then start the environment:

```sh
kiban dev
```

Open a project URL:

```sh
kiban open web
```

That is the normal daily workflow. `kiban dev` starts the Docker services used by your projects, runs each project command, and starts the local reverse proxy.

## Example Config

`kiban.config.json` describes the local environment:

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

With this config, `kiban dev` makes these URLs available:

```text
http://web.localhost:8080
http://api.localhost:8080
```

## Daily Commands

```sh
kiban dev
```

Start services, project commands, and the proxy together.

```sh
kiban doctor
```

Check the active config, proxy port, Docker availability, service references, project working directories, and target reachability.

```sh
kiban list
```

Show configured projects and their URLs.

```sh
kiban ports
```

Show local listening ports and match them to configured projects when possible.

```sh
kiban open web
```

Open a project through its configured local URL.

## Docker Services

When a project lists services, Kiban starts those containers before running the app command and waits for health checks when configured.

```sh
kiban services up
kiban services status
kiban services logs postgres --follow
kiban services down
```

`Ctrl+C` in `kiban dev` stops the project processes and the proxy started by Kiban. Docker services are left running so databases stay available during development. Stop them explicitly with `kiban services down`.

## Proxy Only

Use `kiban proxy` when your app processes are already running and you only want Kiban's URL routing:

```sh
kiban proxy
```

If a Kiban proxy is already running on `proxyPort`, `kiban dev` reuses it. If another process is using the port, Kiban shows a port conflict message with a `kiban kill-port` suggestion.

## Init Without Prompts

`kiban init` asks a few questions in an interactive terminal. You can also create a config non-interactively:

```sh
kiban init --project web --host web.localhost --target http://localhost:3000 --cmd "pnpm dev"
```

## Troubleshooting

Run:

```sh
kiban doctor
```

Common fixes:

- Port conflict: `kiban kill-port 8080 --force`
- Stop Docker services: `kiban services down`
- Check service logs: `kiban services logs postgres --follow`
- Use port 80 URLs without `:8080`: set `"proxyPort": 80` and run with permission to bind port 80

## Install From Source

Until Kiban is published as a package, install it from the repository:

```sh
node --version # v24 or newer
pnpm install
pnpm build
pnpm link --global
```

## Security

Kiban runs commands from your local `kiban.config.json`. Only use configuration files that you trust.
