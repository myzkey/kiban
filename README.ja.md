# Kibaco

[English README](./README.md)

Kibaco は、AI 時代のローカル開発環境マネージャです。

Docker の代替ではありません。Docker Compose とローカルプロセスの上に立ち、開発環境全体を 1 コマンド、固定 URL、ログ、構造化された状態情報として扱えるようにします。

ドキュメント: https://myzkey.github.io/kibaco/

## 解決する課題

モダンな開発環境では、以下のような構成が一般的です。

- Next.js
- Vite
- API Server
- Worker
- PostgreSQL
- Redis
- MinIO

開発者は毎日、同じ作業を繰り返しています。

- Docker を起動
- API を起動
- Web を起動
- Worker を起動
- ポートを確認
- URL を確認

プロジェクトごとに起動方法も異なります。どのターミナルで起動したか、どのサービスが停止しているか、どの URL を使うかを毎回把握しなければなりません。

Kibaco はこれらを 1 つの workspace config で管理し、開発環境全体を 1 コマンドで起動できるようにします。

## Kibacoとは何か

Kibaco はローカル開発環境を管理する CLI です。

アプリの起動コマンド、ローカル URL、リバースプロキシ、ログ、Docker サービス、ヘルスチェックを開発者ごとの `.kibaco/config.json` に保存します。Git 管理用には `kibaco.config.example.json` と JSON Schema を置けるため、AI やチームメンバーも設定構造を理解できます。

Kibaco は「AI 時代のローカル開発環境マネージャ」として育てます。

- シンプルさ
- 1 コマンド体験
- URL 管理
- Docker 連携
- AI との相性

## Before / After

Before:

```sh
docker compose up -d

cd apps/web
pnpm dev

cd apps/api
pnpm dev

cd apps/worker
pnpm dev
```

After:

```sh
kibaco dev
```

## Dockerとの関係

Kibaco は Docker の代替ではありません。

Docker Compose がコンテナを管理するのに対し、Kibaco はコンテナとローカルプロセスを含む開発環境全体を管理します。

| Tool           | Responsibility                     |
| -------------- | ---------------------------------- |
| Docker Compose | Container Management               |
| Kibaco         | Development Environment Management |

project に Docker services を指定すると、Kibaco はアプリ起動前にコンテナを起動し、設定された healthCheck の完了を待ちます。Compose file から推測した services は `docker compose` で管理するため、`.env`、`env_file`、変数展開、networks、volumes は Docker Compose の挙動に従います。

## AI-Friendly

Kibaco provides a structured view of the local development environment.

Example:

```sh
kibaco doctor
```

出力例:

```text
PostgreSQL: running
Redis: running
Web: http://web.localhost:8080
API: http://api.localhost:8080
Worker: stopped
```

機械可読な状態も出力できます。

```sh
kibaco doctor --json
```

出力例:

```json
{
  "workspace": "my-app",
  "proxyPort": 8080,
  "services": [
    {
      "name": "postgres",
      "status": "running"
    }
  ],
  "projects": [
    {
      "name": "web",
      "status": "running",
      "url": "http://web.localhost:8080",
      "target": "http://localhost:3000"
    }
  ],
  "issues": []
}
```

これにより、現在の環境状態を AI やチームメンバーに共有しやすくなります。どのターミナルで何を起動したかを説明する代わりに、Kibaco の状態出力を渡せます。

## 主な機能

- `kibaco dev` で services、project commands、local reverse proxy をまとめて起動
- `http://web.localhost:8080` のような固定 URL でアクセス
- アプリ起動前に必要な Docker services を起動
- すでに起動している Kibaco proxy を再利用
- `kibaco doctor` でポート、Docker、設定、services、projects、target 到達性を確認
- `kibaco explain` で config 探索結果と route を説明
- `kibaco config ...` で validate、format、route 表示、安全な target 更新
- `kibaco doctor --json` で構造化された状態を出力
- `kibaco export` で共有しやすい環境情報を JSON 出力
- project logs を `~/.kibaco/logs/{workspace}` に保存
- `kibaco logs web` と `kibaco logs web --follow` でログを確認
- `kibaco open web` で URL をブラウザ起動
- `kibaco open` で利用可能 URL 一覧を表示
- `Ctrl+C` でアプリと proxy を止めつつ、DB は起動したまま残す

## クイックスタート

プロジェクトディレクトリで設定を作ります。

```sh
kibaco init
```

Kibaco は package manager、`package.json`、dev script、`.env` の port、よく使われる framework、backend/server file、monorepo の app folder、Compose file から設定をできるだけ推測します。

proxy port は `8080` を優先しますが、project target やローカル process と衝突する場合は、`kibaco init` が空いている proxy port を自動選択します。

`kibaco init` は実設定を `.kibaco/config.json` に書き、`.kibaco/` と `kibaco.config.json` を `.gitignore` に追加し、Git 管理できる `kibaco.config.example.json` も生成します。

このプロジェクトで Kibaco が何を管理しているかを確認します。

```sh
kibaco explain
```

開発環境を起動します。

```sh
kibaco dev
```

利用可能 URL を確認します。

```sh
kibaco open
```

ブラウザで開きます。

```sh
kibaco open web
```

## 設定例

Kibaco は設定をプロジェクト配下ではなく `~/.kibaco` に保存します。内容としては以下のような workspace config です。

```json
{
  "workspace": "my-app",
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
    },
    {
      "name": "redis",
      "image": "redis:7",
      "ports": ["6379:6379"],
      "dependsOn": ["postgres"],
      "healthCheck": {
        "type": "tcp",
        "host": "127.0.0.1",
        "port": 6379
      }
    }
  ],
  "projects": [
    {
      "name": "web",
      "host": "web.localhost",
      "target": "http://localhost:3000",
      "command": "pnpm dev",
      "cwd": ".",
      "services": ["postgres"]
    },
    {
      "name": "api",
      "host": "api.localhost",
      "target": "http://localhost:8787",
      "command": "pnpm dev:api",
      "cwd": ".",
      "services": ["postgres", "redis"]
    }
  ]
}
```

この設定では、`kibaco dev` 後に以下の URL が使えます。

```text
http://web.localhost:8080
http://api.localhost:8080
```

healthCheck は現在 TCP、HTTP、command probe をサポートしています。

```json
{
  "healthCheck": {
    "type": "http",
    "url": "http://localhost:3000/health"
  }
}
```

## コマンド一覧

```sh
kibaco dev
kibaco dev web
kibaco dev --select
kibaco dev --verbose
```

services、project commands、proxy をまとめて起動します。project 名を指定しない場合は、設定済み project 全部と、それらが参照する services を起動します。

project の stdout/stderr は log file に保存しますが、デフォルトではターミナルに流しません。インラインで project logs を見たい場合だけ `--verbose` を使います。

```sh
kibaco doctor
kibaco doctor --json
kibaco status
kibaco status --json
```

設定ファイル、proxyPort、Docker の状態、service 参照、project の cwd、service status、project URL、target の到達性を確認します。`status` は現在状態をコンパクトに表示します。

```sh
kibaco list
kibaco list --json
```

設定済み project と URL を表示します。

```sh
kibaco urls
kibaco urls --json
```

設定済み local URL だけを表示します。

```sh
kibaco open
kibaco open web
```

利用可能 URL 一覧を表示するか、指定 project のローカル URL をブラウザで開きます。

```sh
kibaco export
```

services、projects、commands、URLs を共有しやすい JSON として出力します。

```sh
kibaco ports
kibaco ports --json
```

ローカルで listen しているポートを表示し、設定済み project と照合します。

```sh
kibaco logs
kibaco logs web
kibaco logs web --follow
kibaco logs api --tail 200
kibaco logs postgres --service --follow
```

`kibaco dev` が取得した project log を表示します。指定名が configured service に一致する場合は Docker service log も表示できます。

```sh
kibaco restart web
kibaco restart --all
```

起動中の `kibaco dev` が管理している project process を再起動します。

```sh
kibaco services up
kibaco services restart postgres
kibaco services status
kibaco services logs postgres --tail 200 --follow
kibaco services down
```

現在の workspace の Docker services を管理します。

```sh
kibaco proxy
```

ローカル reverse proxy だけを起動します。

```sh
kibaco kill-port 8080 --force
```

指定ポートを listen している process を停止します。

## 将来的な機能候補

高優先度:

- project 起動順を制御する `dependsOn`: API 起動後に Worker、Web 起動後に E2E など
- 起動完了判定としての `healthCheck` 強化
- AI やチームメンバーへ live status も含めて共有する export 出力の強化
- `logs` と `open` のワークフロー強化

中優先度:

- watch モード
- restart policy
- auto recovery
- 起動時間計測

低優先度:

- TUI
- Web Dashboard
- VSCode Extension
- MCP Server

Kibaco は複雑な Kubernetes 的機能を目指しません。シンプルで信頼できるローカル開発環境管理を重視します。

## インストール

リリース後は npm からインストールできます。

```sh
npm install -g kibaco
```

ソースから開発する場合:

```sh
asdf install
node --version # v22.12.0 以上
pnpm install
pnpm build
pnpm link --global
```

npm 公開版と、この checkout のローカルリンク版を切り替える場合:

```sh
pnpm switch:status
pnpm switch:local
pnpm switch:npm
```

公開版のバージョンを指定して戻す場合:

```sh
KIBACO_NPM_VERSION=0.0.1 pnpm switch:npm
```

## セキュリティ

Kibaco は workspace config に書かれたコマンドを実行します。信頼できるワークスペースだけを初期化してください。
