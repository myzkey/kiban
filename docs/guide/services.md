# Docker Services

Kibaco can start and stop Docker services defined in the workspace config.

`kibaco init` can infer services from common Compose files:

- `compose.yaml`
- `compose.yml`
- `docker-compose.yaml`
- `docker-compose.yml`
- `docker.yaml`
- `docker.yml`

It reads service images, ports, environment, volumes, and `depends_on`. For common services such as PostgreSQL, MySQL, Redis, Meilisearch, Mailpit, and MailHog, Kibaco can also infer a simple health check when the Compose file does not define one.

Services inferred from a Compose file are started and stopped through Docker Compose. This lets Compose resolve `.env`, `env_file`, variable substitution, networks, volumes, and other service details. Kibaco still starts application commands itself and routes them through its local proxy.

```sh
kibaco services up
kibaco services restart postgres
kibaco services status
kibaco logs postgres
kibaco services logs postgres --tail 200 --follow
kibaco services down
```

When a project lists services, `kibaco dev` starts those services before running the project command.

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

Kibaco waits for the health check before starting dependent project commands.
