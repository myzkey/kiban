# Development

Run:

```sh
kibaco dev
kibaco dev web
kibaco dev --select
```

Kibaco will:

1. Find the Kibaco workspace config for the current directory
2. Start Docker services referenced by the selected projects
3. Wait for configured health checks
4. Start project commands
5. Start or reuse the local proxy
6. Print the URLs for each project

With no project names, `kibaco dev` starts all configured projects. Use project names or `--select` when you only want part of the workspace.

Kibaco captures each project process log while still streaming it to the terminal.

```text
~/.kibaco/logs/{workspace}/{project}.log
~/.kibaco/logs/{workspace}/{project}.jsonl
```

The text log is easy to read in a terminal. The JSONL log keeps `time`, `project`, `stream`, and `line` fields so tools and AI assistants can read only the project and stream they need.

```sh
kibaco logs
kibaco logs web
kibaco logs web --follow
kibaco logs --all --tail 200
kibaco logs web --jsonl
kibaco logs mysql
```

Restart a project without stopping the proxy:

```sh
kibaco restart web
kibaco restart --all
```

`kibaco restart` asks the running `kibaco dev` process to restart the project, so logs and proxy routing remain under the same dev session.

## Stopping

Press `Ctrl+C` to stop the project processes and the proxy started by Kibaco.

Docker services are left running so databases stay available during development. Stop them explicitly with:

```sh
kibaco services down
```
