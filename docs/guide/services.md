# Docker Services

Kiban can start and stop Docker services defined in the workspace config.

`kiban init` can infer services from common Compose files:

- `compose.yaml`
- `compose.yml`
- `docker-compose.yaml`
- `docker-compose.yml`
- `docker.yaml`
- `docker.yml`

It reads service images, ports, environment, volumes, and `depends_on`. For common services such as PostgreSQL, MySQL, Redis, Meilisearch, Mailpit, and MailHog, Kiban can also infer a simple health check when the Compose file does not define one.

```sh
kiban services up
kiban services status
kiban services logs postgres --follow
kiban services down
```

When a project lists services, `kiban dev` starts those services before running the project command.

## Health Checks

A service can define a health check:

```json
{
  "healthCheck": {
    "type": "tcp",
    "host": "127.0.0.1",
    "port": 5432
  }
}
```

Kiban waits for the health check before starting dependent project commands.
