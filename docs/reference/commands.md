# Commands

## `kibaco init`

Create a Kibaco config for this local workspace.

```sh
kibaco init
```

Kibaco infers values from package managers, `package.json`, dev scripts, `.env` ports, common frameworks, simple backend/server files, monorepo app folders, and Compose files when possible. Override them with options:

```sh
kibaco init --project web --host web.localhost --target http://localhost:3000 --cmd "pnpm dev"
kibaco init --detect
kibaco init --interactive
```

## `kibaco dev`

Start services, app commands, and the local proxy.

```sh
kibaco dev
kibaco dev web api
kibaco dev --select
```

With no project names, `kibaco dev` starts all configured projects and the services referenced by those projects.

## `kibaco restart`

Ask the running `kibaco dev` process to restart project commands.

```sh
kibaco restart web
kibaco restart --all
```

## `kibaco list`

Show configured projects and local URLs.

```sh
kibaco list
kibaco list --json
```

## `kibaco doctor`

Check config, ports, Docker services, and targets.

```sh
kibaco doctor
kibaco doctor --json
```

## `kibaco ports`

Show local listening ports and matching projects.

```sh
kibaco ports
kibaco ports --json
```

## `kibaco logs`

Show project logs captured by `kibaco dev`, or Docker service logs for configured services.

```sh
kibaco logs
kibaco logs web
kibaco logs web --follow
kibaco logs --all --tail 200
kibaco logs web --jsonl
kibaco logs mysql
kibaco logs mysql --service --tail 200
kibaco logs --all-services
```

When run in an interactive terminal without a target, `kibaco logs` lets you choose from configured projects and services.

## `kibaco proxy`

Start only the local reverse proxy.

```sh
kibaco proxy
```

## `kibaco open`

Open a configured project URL in the browser.

```sh
kibaco open web
```

## `kibaco services`

Manage Docker services for this workspace.

```sh
kibaco services up
kibaco services restart postgres
kibaco services status
kibaco services logs postgres --tail 200 --follow
kibaco services down
```

## `kibaco kill-port`

Kill the process listening on a port.

```sh
kibaco kill-port 8080 --force
```
