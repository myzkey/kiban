# Quick Start

Create a config in your project directory:

```sh
kiban init
```

Kiban infers sensible defaults from package managers, `package.json`, dev scripts, `.env` ports, common frameworks, simple backend/server files, monorepo app folders, and Compose files when it can.

Start the environment:

```sh
kiban dev
```

Open a project URL:

```sh
kiban open web
```

That is the normal daily workflow.

## Override Inferred Values

```sh
kiban init --project web --host web.localhost --target http://localhost:3000 --cmd "pnpm dev"
```

Preview inferred config without saving it:

```sh
kiban init --detect
```

Force an interactive review:

```sh
kiban init --interactive
```

`kiban init` can detect:

- Package managers: pnpm, npm, yarn, bun
- Frontend frameworks: Next.js, Vite, Astro, Nuxt, Remix
- Backend projects: Rails, Laravel, Django, Go, Rust, simple Node servers
- Monorepos: `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `apps/*`, `packages/*`, `services/*`
- Environment ports: `.env`, `.env.local`, `.env.development`
- Compose services: images, ports, environment, volumes, dependencies, and common health checks

## Check the Workspace

```sh
kiban doctor
```

`doctor` checks the active config, proxy port, Docker availability, service references, project working directories, and target reachability.
