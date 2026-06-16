# Local HTTP Smoke Test

This example verifies Kiban without Docker.

## Port and Proxy Mode

```sh
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

Browser URL:

```text
http://web.localhost:8080
```

`node ../../dist/cli.js proxy` is still available when you want to run only the reverse proxy.
If that proxy is already running, `node ../../dist/cli.js dev` reuses it.

## Stack Mode

```sh
pnpm build
cd examples/local-http
node ../../dist/cli.js status --json
node ../../dist/cli.js up web
node ../../dist/cli.js status
curl http://localhost:43110
node ../../dist/cli.js logs web
node ../../dist/cli.js down web
```

The project log is written to `~/.kiban/logs/web.log`.
