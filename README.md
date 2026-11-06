# ASCII BATTLE / AAbattle

自作のアスキーアートから能力を生成し、オンラインで **1対1の完全自動戦闘** をするWebゲームです。PC / iPad / スマートフォンのブラウザーに対応しています。

## 実装した機能

- 記号とモノスペースフォントを使ったターミナル風UI。枠・ボタンも `+---+` / `[ ]` 表現
- バックスラッシュ・改行・スペースを保持するAAエディターとプレビュー
- Googleなどに依存しないユーザー名 + パスワードの新規登録・ログイン
- Argon2idによるパスワードハッシュ、HttpOnly / SameSite Cookieによるセッション管理
- アカウントごとのキャラ保存、ステータス・スキル・パッシブ自動生成
- OpenAI APIキーがある場合はAIがアスキーアートを解析して独自能力を生成
- キーなしの場合は **ローカルルール生成モード** と明示して試遊可能
- WebSocketによるオンラインマッチング（両プレイヤーはログインが必要）
- キャラクターの戦闘方針に沿ったサーバー側の完全自動戦闘
- 対戦結果の保存、勝敗数・対戦履歴
- PC・iPad・スマホのレスポンシブUI

## ローカル実行

Node.js 20以上を用意します。

```bash
npm ci
npm start
```

ブラウザーで `http://localhost:3000` を開きます。ローカルではデータをメモリ保存するため、サーバー再起動で消去されます。

テスト:

```bash
npm test
```

## アカウントと保存先

公開環境では PostgreSQL データベースへの接続文字列 `DATABASE_URL` が必須です。未設定ならサーバーは安全のため起動しません。パスワードは平文で保存しません。セッションCookieは公開環境で `Secure`、常時 `HttpOnly; SameSite=Lax` です。

ユーザー名は3～20文字（文字・数字・アンダースコア）。パスワードは10～128文字。ログイン・新規登録に基本的な回数制限があります。パスワード再設定、メール認証、管理者モデレーションは未実装です。実サービスにする前にバックアップ、ログ監視、ユーザー通報、セッション管理を補強してください。

## AI生成モード

AI解析を利用するにはRenderの環境変数などで `OPENAI_API_KEY` を設定します。必要に応じて `AI_MODEL` でモデルを変更できます。**API呼び出しは従量課金になる可能性があります。** キーはGitHubリポジトリやソースコードに記載しないでください。

キーを設定していない場合はローカルの絵柄認識ルールで能力を生成し、画面上にも「LOCAL DEMO」と表示します。ローカルモードは画像理解モデルではありません。

AIの出力を直接コードとして実行することはありません。AIが提案した名前・説明・効果をバトル用の限られた能力形式に変換し、威力やステータスをサーバーで制限します。

## Render デプロイ

リポジトリ直下の `render.yaml` はSingaporeリージョンのWeb ServiceとPostgresを構成します。

1. GitHubリポジトリの `main` に変更を反映する。
2. Renderの [Blueprint作成画面](https://dashboard.render.com/blueprint/new?repo=https://github.com/NekoNekoKoneKo222/AAbattle) を開く。
3. 内容を確認し、Web ServiceとPostgresを作成する。
4. AI生成が必要ならWeb ServiceのEnvironmentに `OPENAI_API_KEY` を安全に設定する。
5. `/api/health` が `{"ok":true}` を返すか確認する。

**注意：Renderの無料Postgresは作成から30日で期限切れになります。期限後14日以内に有料プランへ移行しなければデータ削除となります。無料Web Serviceもアイドル時に停止することがあります。本番運用には長期保存できるデータベースを選んでください。**

無料プランは試験公開用の設定です。勝敗・アカウントの永続性が必要な場合は有料Postgresまたは別の永続データベースを使用してください。

## プロジェクト構成

```text
public/        ブラウザー画面・AAフォント
src/server.js  HTTP API・認証・WebSocket
src/store.js   PostgreSQL / 開発用メモリストア
src/generator.js  AA解析・AI/ローカル生成・能力検証
src/battle.js  自動戦闘エンジン
test/          単体 / 2アカウント対戦テスト
render.yaml    Render配備設定
```

同梱フォント：IBM Plex Mono（SIL Open Font License）。ライセンスは `public/fonts/OFL-LICENSE.txt` にあります。
