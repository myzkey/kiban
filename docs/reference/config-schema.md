# Config Schema

The schema is published in this repository at `schemas/kibaco.config.schema.json`.

## Root

```json
{
  "$schema": "https://kibaco.dev/schemas/kibaco.config.schema.json",
  "workspace": "my-app",
  "proxyPort": 8080,
  "log": {
    "maxBytes": 5242880,
    "maxFiles": 3
  },
  "services": [],
  "projects": []
}
```

- `workspace`: Name used for Docker container names
- `proxyPort`: Local proxy port
- `log`: Per-project log rotation settings
- `services`: Docker services Kibaco can manage
- `projects`: Local app commands and URL routes

The standard project-local config path is:

```text
.kibaco/config.json
```

This file should be ignored by Git. Commit `kibaco.config.example.json` instead.

Project logs are stored under:

```text
~/.kibaco/logs/{workspace}/{project}.log
~/.kibaco/logs/{workspace}/{project}.jsonl
```

## Project

```json
{
  "name": "web",
  "host": "web.localhost",
  "target": "http://localhost:3000",
  "command": "pnpm dev",
  "cwd": ".",
  "services": ["postgres"]
}
```

## Service

```json
{
  "name": "postgres",
  "image": "postgres:16",
  "ports": ["5432:5432"],
  "env": {
    "POSTGRES_PASSWORD": "postgres"
  },
  "volumes": [],
  "dependsOn": [],
  "healthCheck": {
    "type": "tcp",
    "host": "127.0.0.1",
    "port": 5432
  }
}
```

## Health Check

Supported types:

- `tcp`
- `http`
- `command`

## Validation

Run:

```bash
kibaco config validate
```

Typical output:

```text
Config file: ./.kibaco/config.json
Valid: true
```
