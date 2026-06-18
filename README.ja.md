# Kiban

[English README](./README.md)

Kiban は、ローカル開発環境を 1 コマンドで起動するための CLI ツールです。

アプリの起動コマンド、ローカル URL、リバースプロキシ、Docker サービスを `~/.kiban` 配下の workspace config に保存することで、プロジェクトディレクトリを汚さずにローカル開発環境を管理します。

ドキュメント: https://myzkey.github.io/kiban/

## できること

- `kiban dev` でアプリ群をまとめて起動
- `http://web.localhost:8080` のような固定URLでアクセス
- アプリ起動前に必要な Docker services を起動
- すでに起動している Kiban proxy を再利用
- `kiban doctor` でポート、Docker、設定、target の状態を確認
- `Ctrl+C` でアプリと proxy を止めつつ、DB は起動したまま残す

## クイックスタート

プロジェクトディレクトリで設定を作ります。

```sh
kiban init
```

Kiban は package manager、`package.json`、dev script、`.env` の port、よく使われる framework、backend/server file、monorepo の app folder、Compose file から設定をできるだけ推測します。

開発環境を起動します。

```sh
kiban dev
```

ブラウザで開きます。

```sh
kiban open web
```

普段の利用はこれだけです。`kiban dev` は、必要な Docker services、各 project command、ローカルリバースプロキシをまとめて起動します。

## 設定例

Kiban は設定をプロジェクト配下ではなく `~/.kiban` に保存します。内容としては以下のような workspace config です。

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
      "services": ["postgres"]
    }
  ]
}
```

この設定では、`kiban dev` 後に以下の URL が使えます。

```text
http://web.localhost:8080
http://api.localhost:8080
```

## 普段使うコマンド

```sh
kiban dev
```

services、project commands、proxy をまとめて起動します。

```sh
kiban doctor
```

設定ファイル、proxyPort、Docker の状態、service 参照、project の cwd、target の到達性を確認します。

```sh
kiban list
```

設定済み project と URL を表示します。

```sh
kiban ports
```

ローカルで listen しているポートを表示し、設定済み project と照合します。

```sh
kiban logs web --follow
```

`kiban dev` が取得した project log を表示します。project ごとの text log と structured JSONL log は `~/.kiban/logs/{workspace}` に保存されます。

```sh
kiban restart web
```

起動中の `kiban dev` が管理している project process を再起動します。

```sh
kiban open web
```

設定されたローカル URL をブラウザで開きます。

## Docker Services

project に `services` を指定すると、Kiban はアプリ起動前に Docker コンテナを起動し、healthCheck があれば完了まで待ちます。

```sh
kiban services up
kiban services restart postgres
kiban services status
kiban services logs postgres --follow
kiban services down
```

`kiban dev` を `Ctrl+C` で止めると、Kiban が起動した project process と proxy は停止します。Docker services は開発中に継続利用しやすいように残します。止めたい場合は `kiban services down` を実行します。

## Proxy だけ使う

アプリは別の方法で起動していて、Kiban の URL ルーティングだけ使いたい場合は `kiban proxy` を使います。

```sh
kiban proxy
```

すでに同じ `proxyPort` で Kiban proxy が起動している場合、`kiban dev` はそれを再利用します。別のプロセスがポートを使っている場合は、ポート競合メッセージと `kiban kill-port` の案内を表示します。

## init の推測値を上書きする

`kiban init` は推測できる値を自動で埋めます。必要な場合だけ値を上書きできます。

```sh
kiban init --project web --host web.localhost --target http://localhost:3000 --cmd "pnpm dev"
```

保存せずに推測結果だけ確認できます。

```sh
kiban init --detect
```

対話形式で確認しながら作ることもできます。

```sh
kiban init --interactive
```

init が検知できる主なもの:

- package manager: pnpm, npm, yarn, bun
- frontend framework: Next.js, Vite, Astro, Nuxt, Remix
- backend project: Rails, Laravel, Django, Go, Rust, simple Node server
- monorepo: `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `apps/*`, `packages/*`, `services/*`
- port: `.env`, `.env.local`, `.env.development`
- Compose services: image, ports, environment, volumes, depends_on, common health check

## 困ったとき

まず確認します。

```sh
kiban doctor
```

よく使う対処:

- ポート競合を止める: `kiban kill-port 8080 --force`
- Docker services を止める: `kiban services down`
- service logs を見る: `kiban services logs postgres --follow`
- URL から `:8080` をなくす: `"proxyPort": 80` にして、port 80 を bind できる権限で起動

## ソースからインストール

Kiban が package として公開されるまでは、リポジトリからインストールします。

```sh
asdf install
node --version # v24 以上
pnpm install
pnpm build
pnpm link --global
```

## リリース

Kiban は Changesets と GitHub Actions で npm release を管理します。リリース対象の変更では changeset を追加します。

```sh
pnpm changeset
```

## セキュリティ

Kiban は workspace config に書かれたコマンドを実行します。信頼できるワークスペースだけを初期化してください。
