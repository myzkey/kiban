# Kiban

[日本語版 README](./README.ja.md)

Kiban is an AI-friendly local development stack manager.

It starts local app processes such as Next.js, Vite, Rails, Laravel, and API servers while managing local URLs and dependent Docker services such as PostgreSQL, MySQL, Redis, Mailhog, and MinIO from one `kiban.config.json`.

## Install

```sh
pnpm install
pnpm build
pnpm link --global
```

## Quick Start

```sh
kiban init
```

Edit `kiban.config.json`:

```json
{
  "proxyPort": 8080,
  "services": [],
  "projects": [
    {
      "name": "web",
      "host": "web.localhost",
      "target": "http://localhost:3000",
      "command": "pnpm dev",
      "cwd": ".",
      "services": []
    }
  ]
}
```

Then run:

```sh
kiban list
kiban dev
kiban open web
```

Usually, `kiban dev` starts the required Docker services, local app processes, and local proxy together. Use `kiban proxy` only when you want to run the proxy by itself.
If a Kiban proxy is already running on `proxyPort`, `kiban dev` reuses it.

## Local Smoke Test

You can verify the CLI without Docker by using the bundled HTTP server example.

```sh
pnpm install
pnpm build
cd examples/local-http
node ../../dist/cli.js list
node ../../dist/cli.js dev
```

In another terminal:

```sh
cd examples/local-http
curl -H "Host: web.localhost:8080" http://127.0.0.1:8080
```

## Commands

- `kiban init`
- `kiban list`
- `kiban dev`
- `kiban proxy`
- `kiban ports`
- `kiban open`
- `kiban services up`
- `kiban services status`
- `kiban services down`
- `kiban add`
- `kiban up`
- `kiban down`
- `kiban restart`
- `kiban status`
- `kiban logs`
- `kiban doctor`
- `kiban kill-port`
- `kiban edit`

Core inspection commands support `--json` for AI coding agents and scripts.

## Port And Proxy Configuration

`kiban.config.json` is the primary config file for port and URL management:

```json
{
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
      "name": "fusenly",
      "host": "fusenly.localhost",
      "target": "http://localhost:3000",
      "command": "pnpm dev",
      "cwd": ".",
      "services": ["postgres"]
    },
    {
      "name": "fusenly-api",
      "host": "api.fusenly.localhost",
      "target": "http://localhost:8787",
      "command": "pnpm dev:api",
      "cwd": ".",
      "services": ["postgres"]
    }
  ]
}
```

When a project lists services, `kiban dev` starts those Docker containers first, waits for their health checks, starts the local app commands, and then starts the local reverse proxy. Container names use `kiban-{workspace}-{service}`.

If you only need the reverse proxy, run:

```sh
kiban proxy
```

If a Kiban proxy is already running, `kiban dev` reuses it. If another process is using `proxyPort`, Kiban prints a port conflict message with a `kiban kill-port` suggestion.

You can also manage services directly:

```sh
kiban services up
kiban services status
kiban services down
```

## Stack Configuration

`kiban.yml` is still supported by the stack commands such as `up`, `down`, `status`, and `logs`:

```yaml
workspace: default
projects:
  - name: web
    path: ~/projects/web
    command: pnpm dev
    port: 3000
    url: http://localhost:3000
    services:
      - postgres
services:
  - name: postgres
    image: postgres:16
    ports:
      - "5432:5432"
    env:
      POSTGRES_PASSWORD: postgres
    healthCheck:
      type: tcp
      host: 127.0.0.1
      port: 5432
```

Kiban stores runtime data in `~/.kiban`:

- `~/.kiban/logs`
- `~/.kiban/pids`
- `~/.kiban/state`
- `~/.kiban/cache`

Set `KIBAN_HOME` when you want to keep runtime data somewhere else:

```sh
KIBAN_HOME=/tmp/kiban-dev kiban status
```

## Security

Kiban runs commands from your local `kiban.config.json` or `kiban.yml`. Only use configuration files that you trust.
