# ASCII BATTLE / AAbattle

自作のアスキーアートから能力を生成し、オンラインで **1対1の完全自動戦闘** をするWebゲームです。PC / iPad / スマートフォンのブラウザーに対応しています。

## 実装した機能

- 記号とモノスペースフォントを使ったターミナル風UI。枠・ボタンも `+---+` / `[ ]` 表現
- バックスラッシュ・改行・スペースを保持するAAエディターとプレビュー
- Googleなどに依存しないユーザー名 + パスワードの新規登録・ログイン
- Argon2idによるパスワードハッシュ、HttpOnly / SameSite Cookieによるセッション管理
- アカウントごとのキャラ保存、ステータス・スキル・パッシブ自動生成
- Gemini APIキーがある場合はAIがAAを解析し、固有のスキル3つ・パッシブ1つを新規生成
- スキルの追加効果（攻撃・回復・状態異常など）を組み合わせて自動戦闘に反映
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

Neonを使う場合は、初回にデータベースオーナーの**直接接続**で `migrations/001_init.sql` を適用してください。Webアプリ用には、`public` スキーマに対する `read_write` 権限だけを持つ別ロールのプール接続文字列を設定します。アプリの起動時にはスキーマを変更しません。

## AI生成モード

AI解析を利用するには[Google AI Studio](https://aistudio.google.com/apikey)でGemini APIキーを作成し、Render Web Serviceの **Environment** 画面で非公開環境変数 `GEMINI_API_KEY` に設定して保存・デプロイしてください。モデルは既定で `gemini-3.5-flash-lite`、必要なら `GEMINI_MODEL` で変更できます。**無料枠には利用上限があり、課金設定や利用量に応じて料金が発生することがあります。** キーはGitHub・クライアント側のJavaScript・チャットに記載しないでください。

GeminiモードはAAと過去に生成した技名をモデルへ送り、**3つの技名・説明・効果の組み合わせ・パッシブを新しく生成**します。同一キャラ内や過去の技名と重複した場合は再生成を試みます。生成した能力値はサーバーで正規化・上限制限します。

キーが未設定の場合はローカルの絵柄認識ルールで能力を生成し、画面上に「GENERATOR : LOCAL (GEMINI KEY REQUIRED)」と表示します。ローカルモードはAI生成ではなく、固定テンプレートを使用するため重複することがあります。

AIの出力を直接コードとして実行することはありません。AIが提案した名前・説明・効果をバトル用の限られた能力形式に変換し、威力やステータスをサーバーで制限します。

## 長期保存用データベース + Render デプロイ

リポジトリ直下の `render.yaml` はSingaporeリージョンのRender Web Serviceを構成します。**期限付きのRender無料Postgresは作成しません。** アカウントや対戦履歴は外部の長期保存向けPostgreSQL（例：Neon）に保存します。

1. [Neon](https://neon.com/) などでPostgreSQLデータベースを作成する。Neonの無料プランは2026年10月現在1プロジェクトあたり1GBのストレージ枠がありますが、無料プランの内容や利用規約は将来変更され得ます。
2. `migrations/001_init.sql` を直接接続で適用し、アプリ用の `read_write` ロールを作成する。Neonでは `sslmode=require` を含むプール接続文字列を使用してください。**接続文字列をGitHubやチャットに公開しないでください。**
3. GitHubリポジトリの `main` に変更を反映する。
4. Renderの [Blueprint作成画面](https://dashboard.render.com/blueprint/new?repo=https://github.com/NekoNekoKoneKo222/AAbattle) を開く。
5. Blueprintの初回適用時に、必要な秘密環境変数 `DATABASE_URL` に接続文字列を設定する。
6. AI生成が必要ならWeb ServiceのEnvironmentに `GEMINI_API_KEY` を安全に設定する。
7. `/api/health` が `{"ok":true}` を返すか確認する。別々のアカウントで登録・対戦し、再起動後も戦績が残ることを確認する。

**注意：**Renderの無料Web Serviceはアクセスがないと停止することがあり、接続中の試合も再起動時に中断されます。PostgreSQLのデータ自体はWeb Serviceの再起動では消えませんが、無料データベースに完全な永続性や無制限の可用性が保証されるわけではありません。重要なデータは定期的に別の保存先にバックアップしてください。

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
