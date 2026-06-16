# Kiban

[English README](./README.md)

Kiban は、ローカル開発環境を 1 コマンドで起動するための CLI ツールです。

アプリの起動コマンド、ローカル URL、リバースプロキシ、Docker サービスを `kiban.config.json` にまとめておくことで、どのターミナルで何を起動するか、どのポートを見るか、どの DB コンテナが必要かを迷わず扱えるようにします。

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

`kiban.config.json` にローカル開発環境を定義します。

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
kiban open web
```

設定されたローカル URL をブラウザで開きます。

## Docker Services

project に `services` を指定すると、Kiban はアプリ起動前に Docker コンテナを起動し、healthCheck があれば完了まで待ちます。

```sh
kiban services up
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

## 質問なしで init する

`kiban init` は対話ターミナルでは質問しながら設定を作ります。非対話で作る場合は値を指定できます。

```sh
kiban init --project web --host web.localhost --target http://localhost:3000 --cmd "pnpm dev"
```

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
node --version # v24 以上
pnpm install
pnpm build
pnpm link --global
```

## セキュリティ

Kiban はローカルの `kiban.config.json` に書かれたコマンドを実行します。信頼できる設定ファイルだけを使ってください。
