# Development

Run:

```sh
kiban dev
```

Kiban will:

1. Find the Kiban workspace config for the current directory
2. Start Docker services referenced by projects
3. Wait for configured health checks
4. Start project commands
5. Start or reuse the local proxy
6. Print the URLs for each project

Kiban captures each project process log while still streaming it to the terminal.

```text
~/.kiban/logs/{workspace}/{project}.log
~/.kiban/logs/{workspace}/{project}.jsonl
```

The text log is easy to read in a terminal. The JSONL log keeps `time`, `project`, `stream`, and `line` fields so tools and AI assistants can read only the project and stream they need.

```sh
kiban logs web
kiban logs web --follow
kiban logs --all --tail 200
kiban logs web --jsonl
```

Restart a project without stopping the proxy:

```sh
kiban restart web
kiban restart --all
```

`kiban restart` asks the running `kiban dev` process to restart the project, so logs and proxy routing remain under the same dev session.

## Stopping

Press `Ctrl+C` to stop the project processes and the proxy started by Kiban.

Docker services are left running so databases stay available during development. Stop them explicitly with:

```sh
kiban services down
```
