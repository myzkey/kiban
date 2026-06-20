# kibaco

## 0.0.2

### Patch Changes

- Improve local dev startup for monorepos and Compose-backed services.

  - Start Compose-inferred services through `docker compose`.
  - Detect monorepo app projects more reliably.
  - Keep `kibaco dev` quiet by default and add `--verbose`.
  - Add `kibaco urls` for checking configured local URLs.
  - Infer `VITE_PORT` and automatically choose a non-conflicting proxy port.
