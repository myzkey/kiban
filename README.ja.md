# Kiban

[English README](./README.md)

Kiban は、AI エージェントからも扱いやすいローカル開発環境マネージャーです。

Next.js、Vite、Rails、Laravel、API サーバーなどのローカルプロセスと、PostgreSQL、MySQL、Redis、Mailhog、MinIO などの Docker サービスを `kiban.config.json` からまとめて管理します。

## インストール

```sh
pnpm install
pnpm build
pnpm link --global
```

## クイックスタート

```sh
kiban init
```

生成された `kiban.config.json` を編集します。

```json
{
  "proxyPort": 8080,
  "services": [],
  "projects": [
    {
      "name": "web",
      "host": "web.localhost",
      "target": "http://localhost:3000",
      "command": "pnpm dev",
      "cwd": ".",
      "services": []
    }
  ]
}
```

起動します。

```sh
kiban list
kiban dev
kiban open web
```

通常は `kiban dev` を実行するだけで、必要な Docker サービス、アプリケーションプロセス、ローカルプロキシがまとめて起動します。プロキシだけを単独で起動したい場合は `kiban proxy` を使います。
すでに同じ `proxyPort` で Kiban proxy が起動している場合、`kiban dev` はそれを再利用します。

## ローカル動作確認

Docker なしで試せるサンプルがあります。

```sh
pnpm install
pnpm build
cd examples/local-http
node ../../dist/cli.js list
node ../../dist/cli.js dev
```

別ターミナルで実行します。

```sh
cd examples/local-http
curl -H "Host: web.localhost:8080" http://127.0.0.1:8080
```

ブラウザでは以下を開きます。

```text
http://web.localhost:8080
```

## コマンド

- `kiban init`
- `kiban list`
- `kiban dev`
- `kiban proxy`
- `kiban ports`
- `kiban open`
- `kiban services up`
- `kiban services status`
- `kiban services down`
- `kiban add`
- `kiban up`
- `kiban down`
- `kiban restart`
- `kiban status`
- `kiban logs`
- `kiban doctor`
- `kiban kill-port`
- `kiban edit`

主要な確認系コマンドは `--json` に対応しています。

## ポートとプロキシ設定

`kiban.config.json` が、ポート・URL 管理のメイン設定ファイルです。

```json
{
  "proxyPort": 8080,
  "services": [
    {
      "name": "postgres",
      "image": "postgres:16",
      "ports": ["5432:5432"],
      "env": {
        "POSTGRES_PASSWORD": "postgres",
        "POSTGRES_DB": "app"
      },
      "healthCheck": {
        "type": "tcp",
        "host": "127.0.0.1",
        "port": 5432
      }
    }
  ],
  "projects": [
    {
      "name": "fusenly",
      "host": "fusenly.localhost",
      "target": "http://localhost:3000",
      "command": "pnpm dev",
      "cwd": ".",
      "services": ["postgres"]
    },
    {
      "name": "fusenly-api",
      "host": "api.fusenly.localhost",
      "target": "http://localhost:8787",
      "command": "pnpm dev:api",
      "cwd": ".",
      "services": ["postgres"]
    }
  ]
}
```

`projects[].services` にサービス名を書くと、`kiban dev` は先に Docker コンテナを起動し、health check を待ってからローカルアプリのコマンドを起動し、最後にローカルリバースプロキシを起動します。

プロキシだけを単独で起動したい場合は以下を使います。

```sh
kiban proxy
```

すでに Kiban proxy が起動している場合、`kiban dev` はそれを再利用します。別のプロセスが `proxyPort` を使っている場合は、ポート競合メッセージと `kiban kill-port` の案内を表示します。

コンテナ名は `kiban-{workspace}-{service}` 形式です。

サービスだけを操作することもできます。

```sh
kiban services up
kiban services status
kiban services down
```

## Stack 設定

`kiban.yml` も、`up`、`down`、`status`、`logs` などの stack 系コマンド向けに引き続きサポートしています。

```yaml
workspace: default
projects:
  - name: web
    path: ~/projects/web
    command: pnpm dev
    port: 3000
    url: http://localhost:3000
    services:
      - postgres
services:
  - name: postgres
    image: postgres:16
    ports:
      - "5432:5432"
    env:
      POSTGRES_PASSWORD: postgres
    healthCheck:
      type: tcp
      host: 127.0.0.1
      port: 5432
```

Kiban の内部データはデフォルトで `~/.kiban` に保存されます。

- `~/.kiban/logs`
- `~/.kiban/pids`
- `~/.kiban/state`
- `~/.kiban/cache`

保存先を変えたい場合は `KIBAN_HOME` を指定します。

```sh
KIBAN_HOME=/tmp/kiban-dev kiban status
```

## セキュリティ

Kiban はローカルの `kiban.config.json` または `kiban.yml` に書かれたコマンドを実行します。信頼できる設定ファイルだけを使ってください。
