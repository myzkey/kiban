# Proxy

Kibaco exposes stable local URLs through a reverse proxy.
By default, Kibaco prefers port `8080`, but `kibaco init` chooses another available proxy port when `8080` is already used by one of the inferred project targets or another local process. Run `kibaco urls` to see the saved URLs for your workspace.

```json
{
  "proxyPort": 8080,
  "projects": [
    {
      "name": "web",
      "host": "web.localhost",
      "target": "http://localhost:3000",
      "command": "pnpm dev",
      "cwd": "."
    }
  ]
}
```

This project is available at:

```text
http://web.localhost:8080
```

## Proxy Only

Use `kibaco proxy` when app processes are already running and you only want URL routing:

```sh
kibaco proxy
```

If a Kibaco proxy is already running on `proxyPort`, `kibaco dev` reuses it.

## WebSocket and HMR

Kibaco forwards HTTP Upgrade requests for WebSocket routes such as Next.js `/_next/webpack-hmr`.

That means a proxied Next.js app can keep hot reload working through a stable URL:

```text
http://web.localhost:8080 -> http://localhost:3000
```
