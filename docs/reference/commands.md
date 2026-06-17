# Commands

## `kiban init`

Create a Kiban config for this local workspace.

```sh
kiban init
```

Kiban infers values from package managers, `package.json`, dev scripts, `.env` ports, common frameworks, simple backend/server files, monorepo app folders, and Compose files when possible. Override them with options:

```sh
kiban init --project web --host web.localhost --target http://localhost:3000 --cmd "pnpm dev"
kiban init --detect
kiban init --interactive
```

## `kiban dev`

Start services, app commands, and the local proxy.

```sh
kiban dev
```

## `kiban restart`

Ask the running `kiban dev` process to restart project commands.

```sh
kiban restart web
kiban restart --all
```

## `kiban list`

Show configured projects and local URLs.

```sh
kiban list
kiban list --json
```

## `kiban doctor`

Check config, ports, Docker services, and targets.

```sh
kiban doctor
kiban doctor --json
```

## `kiban ports`

Show local listening ports and matching projects.

```sh
kiban ports
kiban ports --json
```

## `kiban logs`

Show project logs captured by `kiban dev`.

```sh
kiban logs web
kiban logs web --follow
kiban logs --all --tail 200
kiban logs web --jsonl
```

## `kiban proxy`

Start only the local reverse proxy.

```sh
kiban proxy
```

## `kiban open`

Open a configured project URL in the browser.

```sh
kiban open web
```

## `kiban services`

Manage Docker services for this workspace.

```sh
kiban services up
kiban services restart postgres
kiban services status
kiban services logs postgres --follow
kiban services down
```

## `kiban kill-port`

Kill the process listening on a port.

```sh
kiban kill-port 8080 --force
```
