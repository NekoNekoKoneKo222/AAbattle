# ASCII BATTLE / AAbattle

## ANOMALY IDLE（/abn）

`https://aabattle-vkc5.onrender.com/abn` で遊べる、ブラウザー内保存の2D放置型研究施設ゲームです。AAbattleのアカウントや図鑑とは独立しています。PC・iPadで施設をドラッグ、ホイールまたはピンチで拡大縮小できます。

施設画面で10種類の部屋を建築・強化・移動・撤去し、研究員を雇用して自動研究を進めます。探索で10種類のアノマリーを発見し、収容室に入れると固有効果と危険性が加わります。研究ツリー、10種類のArtifactの制作と装備、探索の自動化、収容違反の手動・自動復旧、研究成果を使う転生と永続強化があります。ゲームを閉じている間は最大12時間から強化で最大7日分の資源・探索が進みます。オフライン中の事故は修理費だけで処理します。

セーブはIndexedDB、利用できない環境ではlocalStorageです。30秒ごとと重要操作時に保存し、設定からJSONでバックアップ・復元できます。PWA用のService Workerもあります。ゲーム計算とデータ定義は `public/abn/engine.js`、画面は `public/abn/app.js` と `style.css` です。アノマリーや部屋、Artifactは各データ配列に追加できます。

ローカル実行は下記の `npm start` を使い、`http://localhost:3000/abn` を開きます。テストは `npm test` に含まれます。現状の制限は、セーブが端末間で同期されないこと、研究モードの切替と研究員の個別配置がないこと、施設の絵がCSS・記号による簡易表現であることです。

## SHIFT ARENA（/sam）

`https://aabattle-vkc5.onrender.com/sam` で遊べる、オリジナルの3D見下ろし型対戦ゲームです。既存のAAbattleアカウントでログインでき、ゲストでも遊べます。AAbattle本体のAA図鑑・対戦機能は独立しています。

- React・TypeScript・Vite・Three.jsで描画。Windows PCのキーボードとマウス、iPadのタッチ操作に対応。
- 8キャラクター、3マップ、通常攻撃・必殺技・特殊スキル・パッシブ、HP・KO・復活を実装。
- ソロCPU戦と、Colyseusによるサーバー判定のオンライン3対3戦。クイックマッチと6桁コードのフレンドルームに対応。
- コア争奪戦、チームデスマッチ、デュエル、サバイバル、ペイロードを選択可能。試合中にフィールドが変化します。
- ロビー、キャラクター選択、試合、結果画面、画質・効果音・タッチ操作設定を用意。
- キャラロード、キャラクター別ロードアウト、マスタリー、デイリーミッション、フレンド・パーティー、チーム専用ピンと定型チャットを追加。試合報酬とキャラクター解放はサーバーで確定します。
- オフラインのトレーニング場では未所持キャラクターも試せます。ダミー、CPU、マップとロードアウトの切り替え、攻撃・命中・ダメージの計測に対応します。

実装は `shift-arena/apps/client`、`shift-arena/apps/server`、`shift-arena/packages/shared` に分かれています。公開ビルドは `npm run build:shift`、共通処理のテストは `npm run test:shift`、ブラウザーテストは `npx playwright test` で実行します。オンラインルームと試合結果はサーバーのメモリ上にあり、再起動で消えます。

SHIFT ARENA のアカウント進行は PostgreSQL の `migrations/005_shift_arena.sql` を既存の移行の後で適用すると有効になります。既存の `users` とセッションを共有し、SHIFT専用テーブルに所持キャラ、クレジット、ロードアウト、フレンド、報酬履歴を保存します。フレンドとパーティーの機能はログインが必要です。ミッションの日付は UTC で毎日切り替わります。パーティーの参加状態と進行中の試合はメモリ上にあり、サーバー再起動時に解散・中断されます。

`/model` はSHIFT ARENAのモデル工房です。BlockbenchのBedrock Entity形式の `.geo.json` と `.animation.json`、PNGテクスチャを読み込み、新キャラ・既存キャラ・既存ステージの提出用JSONを作れます。攻撃・スキル使用の数値キーフレームはプレビューでき、提出用JSONを再読み込みして編集を続けられます。完成したJSONをこのチャットに添付してもらい、ゲーム本体に組み込んで全プレイヤー向けに公開します。作品はブラウザー内に下書きとして残りますが、アカウントへのモデル保存や提出だけで自動公開は行いません。ゲームで使うモデルのテクスチャ・UVやステージの配置・当たり判定は組み込み時に調整します。Molang式と複雑な補間方式は読み込み対象外です。

自作のアスキーアートから能力を生成し、オンラインで **1対1の完全自動戦闘** をするWebゲームです。PC / iPad / スマートフォンのブラウザーに対応しています。

## 実装した機能

- 記号とモノスペースフォントを使ったターミナル風UI。枠・ボタンも `+---+` / `[ ]` 表現
- バックスラッシュ・改行・スペースを保持するAAエディターとプレビュー
- Googleなどに依存しないユーザー名 + パスワードの新規登録・ログイン
- Argon2idによるパスワードハッシュ、HttpOnly / SameSite Cookieによるセッション管理
- アカウントごとのキャラ保存、ステータス・スキル・パッシブ自動生成
- 図鑑でキャラクターの全能力値・技の効果・パッシブを開いて確認
- プレイヤー名で相手のAAを検索し、互いのAAを指定した1対1のトレード申請
- トレード申請の受諾・拒否・取り消し、7日間の有効期限、交換履歴の長期保存
- Gemini APIキーがある場合はAIがAAを解析し、固有のスキル3つ・パッシブ1つを新規生成
- スキルの追加効果（攻撃・回復・状態異常など）を組み合わせて自動戦闘に反映
- キーなしの場合は **ローカルルール生成モード** と明示して試遊可能
- WebSocketによるオンラインマッチング（両プレイヤーはログインが必要）
- ソロPvE（EASY / NORMAL / HARD / BOSSの4難易度、CPUもスキル・パッシブを使う完全自動戦闘）
- PvEリプレイ・スキップ、PvPとは独立したPvE勝敗数・直近20戦の履歴保存
- キャラクターの戦闘方針に沿ったサーバー側の完全自動戦闘
- 対戦結果の保存、勝敗数・対戦履歴
- PC・iPad・スマホのレスポンシブUI

## ローカル実行

Node.js 20以上を用意します。

```bash
npm ci
npm run build:shift
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

Neonを使う場合は、初回にデータベースオーナーの**直接接続**で `migrations/001_init.sql`、トレード機能追加時に `migrations/002_trades.sql`、PvE追加時に `migrations/003_pve.sql` を適用してください。Webアプリ用には読み書き権限だけを持つ別ロールのプール接続文字列を設定します。アプリの起動時にはスキーマを変更しません。

## AAトレード

1. 両方のプレイヤーがゲーム専用アカウントでログインし、交換するAAをそれぞれ所持します。
2. 「トレード」画面で交換相手のユーザー名を検索します。
3. 自分が渡すAAと相手から受け取るAAを選んで申請します。
4. 受信者がトレード画面で申請内容を確認し、「交換を承認」を押したときのみ成立します。拒否・取消しも可能です。

交換はPostgreSQLの単一トランザクションで2体の所有者を同時に変更します。承認時にも所有権を再確認し、すでに交換済みのAAを二重に譲渡できないようにします。対戦中・マッチング中のプレイヤー間では承認できません。パスワードや秘密のセッション情報は他ユーザーに公開しません。

## SOLO PvE

PvEタブでは所持AAと難易度を選ぶだけで、自動戦闘エンジンがCPU戦の勝敗をサーバー上で計算・保存し、ターンごとのログをブラウザーで再生します。途中で再生をスキップしても戦績は保存済みです。

- `EASY` 迷子のスライム：初心者向け。回復と弱体化。
- `NORMAL` 時計仕掛けの番人：シールドと反撃。
- `HARD` CORRUPTED BEAST：毒・火傷・HP吸収。
- `BOSS` THE NULL EMPEROR：気絶・自己強化・HP吸収。

PvEの勝敗数は `pve_matches` に保存します。オンラインPvPの勝率や戦績には影響しません。連続リクエスト防止のため、PvE実行は1アカウントにつき1時間24回までの制限があります。敵キャラはサーバー定義であり、ユーザーの所持AAへ追加・トレードすることはできません。

## AI生成モード

AI解析を利用するには[Google AI Studio](https://aistudio.google.com/apikey)でGemini APIキーを作成し、Render Web Serviceの **Environment** 画面で非公開環境変数 `GEMINI_API_KEY` に設定して保存・デプロイしてください。モデルは既定で `gemini-3.5-flash-lite`、必要なら `GEMINI_MODEL` で変更できます。**無料枠には利用上限があり、課金設定や利用量に応じて料金が発生することがあります。** キーはGitHub・クライアント側のJavaScript・チャットに記載しないでください。

GeminiモードはAAと過去に生成した技名をモデルへ送り、**3つの技名・説明・効果の組み合わせ・パッシブを新しく生成**します。同一キャラ内や過去の技名と重複した場合は再生成を試みます。生成した能力値はサーバーで正規化・上限制限します。

キーが未設定の場合はローカルの絵柄認識ルールで能力を生成し、画面上に「GENERATOR : LOCAL (GEMINI KEY REQUIRED)」と表示します。ローカルモードはAI生成ではなく、固定テンプレートを使用するため重複することがあります。

AIの出力を直接コードとして実行することはありません。AIが提案した名前・説明・効果をバトル用の限られた能力形式に変換し、威力やステータスをサーバーで制限します。

## 長期保存用データベース + Render デプロイ

リポジトリ直下の `render.yaml` はSingaporeリージョンのRender Web Serviceを構成します。**期限付きのRender無料Postgresは作成しません。** アカウントや対戦履歴は外部の長期保存向けPostgreSQL（例：Neon）に保存します。

1. [Neon](https://neon.com/) などでPostgreSQLデータベースを作成する。Neonの無料プランは2026年10月現在1プロジェクトあたり1GBのストレージ枠がありますが、無料プランの内容や利用規約は将来変更され得ます。
2. `migrations/001_init.sql`、`migrations/002_trades.sql`、`migrations/003_pve.sql` を直接接続で適用し、アプリ用の読み書きロールを作成する。Neonでは `sslmode=require` を含むプール接続文字列を使用してください。**接続文字列をGitHubやチャットに公開しないでください。**
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
src/pve.js     CPU敵キャラ・PvE戦闘
test/          単体 / 2アカウント対戦テスト
render.yaml    Render配備設定
```

同梱フォント：IBM Plex Mono（SIL Open Font License）。ライセンスは `public/fonts/OFL-LICENSE.txt` にあります。

## 第1段階: Windows PCでのOllama生成

この段階はローカル試験用です。Render、Cloudflare、Neonの設定は変更しません。
ローカルで `DATABASE_URL` を設定しなければ、ゲームはメモリ保存を使います。試験用アカウントとキャラクターはサーバー再起動で消えます。

1. [Ollama公式サイト](https://ollama.com/download/windows)からWindows版をインストールし、Ollamaを起動します。既にインストール済みなら再インストール不要です。
2. PowerShellで `ollama pull qwen2.5:3b`、`ollama run qwen2.5:3b` を実行し、日本語で応答するか確認します。Ollamaは `127.0.0.1:11434` のまま使用し、`OLLAMA_HOST=0.0.0.0` は設定しません。
3. リポジトリで `npm ci` を実行します。PowerShellで `$env:AI_PROVIDER='ollama'`、`$env:OLLAMA_MODEL='qwen2.5:3b'`、`npm start` の順に実行します。ブラウザーで `http://localhost:3000` を開いて試験用アカウントを登録します。
4. 既存のAAエディターで猫、ロボット、剣などを入力し、`GENERATE FIGHTER` を押します。接続状態、モデル、生成時間、能力と技が表示されます。対戦画面で生成キャラクターを選択できます。
5. `npm test` で自動テストを実行します。実機の3種生成と自動戦闘は、Ollamaを起動した状態で `$env:AI_PROVIDER='ollama'; node test/live-ollama.mjs` を実行します。HTTP経由の認証・保存は `node test/live-http.mjs` で確認できます。生成中はCPU環境で数十秒かかる場合があります。`ollama ps` の `PROCESSOR` 列でGPUかCPUかを確認できます。

`AI_PROVIDER=gemini` は既存の `GEMINI_API_KEY` と任意の `GEMINI_MODEL` を使います。`AI_PROVIDER=local` は従来の固定ルールです。`AI_PROVIDER` を設定しない場合も、従来どおりGeminiキーがあればGemini、なければローカルルールです。Ollamaが停止している場合や応答が不正な場合、生成だけがエラーになり、ログインや対戦などは引き続き使えます。AIの応答はサーバー側で検証・補正し、コードとして実行しません。 AAbattleの生成画面ではGemini APIとOllamaをボタンで切り替えられます。選択はブラウザーに保存され、その生成ジョブだけに適用されます。`GEMINI_API_KEY` が設定済みなら初回はGeminiを選びます。APIキーはサーバー内だけで使用し、画面やリクエストには送信しません。

## 第2段階: RenderからPCのOllamaへ安全に接続

### 既存のBlueStacks公開URLを使う無料経路

BlueStacksのプロジェクトと443番の既存Funnelは変更しません。同じTailscaleホストの8443番だけをAIゲートウェイ `127.0.0.1:8787` に割り当てます。公開されるAPIはBearer認証と入力・回数制限を備えたゲートウェイだけで、Ollamaの11434番は公開しません。FunnelのURLは誰でも到達できるため、Bearerトークンは十分長い乱数にし、RenderとPCのみに保存します。

`https://nekoneko-pc.tail877793.ts.net/game` は既存BlueStacksのトップページへ、`https://nekoneko-pc.tail877793.ts.net/AAbattle` はRenderのゲームへ302転送します。転送先でブラウザーのURLが変わります。入口用の小さなローカルサーバーは `npm run routes` で起動し、それぞれ `127.0.0.1:8790` と `127.0.0.1:8791` にだけ待ち受けます。443番のFunnelに `--set-path=/game` と `--set-path=/AAbattle` の経路を追加します。既存の `/` 経路はそのままです。

Renderでは `OLLAMA_GATEWAY_AUTH=tailscale`、`OLLAMA_GATEWAY_URL=https://nekoneko-pc.tail877793.ts.net:8443`、PCと同じ `OLLAMA_GATEWAY_TOKEN`、`AI_PROVIDER=ollama` を設定します。Tailscale経路ではCloudflare Accessの環境変数は使用しません。公開後は匿名・誤ったBearerトークンで401、正しいBearerトークンで `/v1/status` が応答することを確認します。Tailscale Funnelは[公式ドキュメント](https://tailscale.com/docs/features/tailscale-funnel)で8443番をサポートしています。

### Cloudflare Accessを使う経路

通信経路は Render → HTTPS → Cloudflare Access → Cloudflare Tunnel → PCの `127.0.0.1:8787` ゲートウェイ → `127.0.0.1:11434` Ollama です。ルーターのポート開放、Ollamaの直接公開、`OLLAMA_HOST=0.0.0.0`、認証なしQuick Tunnelは使いません。通常の公開TunnelにはCloudflareで管理するドメインの安定したホスト名が必要です。

**ドメインを持たない場合の無料経路:** Cloudflare Workers VPC（現在ベータ）で名前付きTunnelをWorkerのVPC Serviceに接続し、無料の `workers.dev` ホスト名をCloudflare Accessで保護できます。この場合の経路は Render → Access → Worker → Workers VPC → Tunnel → PCゲートウェイです。`cloudflare/worker.js` は必要な3種類のAPI経路だけを転送し、Bearer以外の秘密ヘッダーはPCへ渡しません。Workers VPCのベータ期間中の無料枠とWorkers Freeの利用制限は[公式のVPC手順](https://developers.cloudflare.com/workers-vpc/get-started/)、[公式料金表](https://developers.cloudflare.com/workers/platform/pricing/)で確認してください。ベータ機能の提供条件は変更される可能性があります。

### PC側

1. Ollamaと `qwen2.5:3b` を起動します。Windows版 `cloudflared` を[Cloudflare公式のダウンロード案内](https://developers.cloudflare.com/tunnel/downloads/)に従って導入します。
2. PCとRenderの両方に設定する、32文字以上のランダムなBearerトークンを作ります。例: `node -p "require('node:crypto').randomBytes(32).toString('hex')"`。この値は秘密として保存し、GitHub・チャット・ログへ貼り付けないでください。
3. ゲートウェイを起動するPowerShellで `$env:OLLAMA_GATEWAY_TOKEN = Read-Host 'Gateway bearer token'` として値を入力し、`npm run gateway` を実行します。ゲートウェイは必ず `127.0.0.1:8787` にのみ待ち受けます。`node test/live-gateway.mjs` は別の一時トークンでPC内のBearer認証とOllama実生成を検証します。
4. Cloudflareダッシュボードで名前付きTunnelを作成し、PCの `cloudflared` を接続します。Published application routeのホスト名を `ai.<管理ドメイン>` などにし、Service URLを `http://127.0.0.1:8787` に設定します。[公式Tunnel手順](https://developers.cloudflare.com/tunnel/get-started/)を参照してください。
5. Cloudflare Accessでそのホスト名を対象にSelf-hosted applicationを作ります。Render専用のService Tokenを作成し、ポリシーはそのトークンをIncludeする **Service Auth** とします。認証なしのAllow・Bypassポリシーは追加しません。[公式Service Token手順](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)を参照してください。

### Render側

RenderのWeb Service `aabattle-vkc5` → **Environment** で次のキーを個別に設定します。秘密値は `render.yaml` や `.env.example` に書きません。既存の `DATABASE_URL`、`GEMINI_API_KEY`、`GEMINI_MODEL` は保持します。

| キー | 値 |
| --- | --- |
| `AI_PROVIDER` | `ollama` |
| `OLLAMA_GATEWAY_URL` | Cloudflare Accessで保護した固定の `https://ai.<管理ドメイン>` |
| `OLLAMA_GATEWAY_TOKEN` | PCゲートウェイと同じBearerトークン |
| `CF_ACCESS_CLIENT_ID` | Render専用Service TokenのClient ID |
| `CF_ACCESS_CLIENT_SECRET` | 同Client Secret |
| `OLLAMA_MODEL` | `qwen2.5:3b`（任意、既定値も同じ） |

Tunnel・Access・ゲートウェイの動作確認後にRenderで **Save, rebuild, and deploy** を選びます。先に保存だけした場合、次のデプロイまで環境変数は実行中サービスに反映されません。[Render環境変数の公式手順](https://render.com/docs/configure-environment-variables)を参照してください。

### ドメインなしでWorkers VPCを使う場合

1. Cloudflareダッシュボードの **Workers VPC ベータ** で名前付きTunnelを作成し、PCの `cloudflared` を接続します。Tunnelの資格情報はGitHubに保存しません。
2. VPC Serviceを作成し、そのTunnel、PC側ホスト `127.0.0.1`、HTTPポート `8787` を指定します。発行されたService IDを控えます。
3. `cloudflare/wrangler.jsonc.example` を `cloudflare/wrangler.jsonc` にコピーし、`REPLACE_WITH_VPC_SERVICE_ID` を実際のService IDに置き換えます。`npx wrangler deploy --config cloudflare/wrangler.jsonc` でWorkerを作成します。Workerの `workers.dev` URLを控えます。
4. Cloudflare Accessでその `workers.dev` ホスト名のSelf-hosted applicationを作り、Render専用Service Tokenだけを許可するService Authポリシーを設定します。[WorkersへのAccess設定手順](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)を参照してください。
5. Renderの `OLLAMA_GATEWAY_URL` にその固定 `https://...workers.dev` URLを設定します。他の環境変数と検証手順は上記と同じです。Access保護前にWorkerのURLを本番の接続先へ設定しないでください。

Renderからは固定HTTPSホストの `POST /v1/skills/generate` と `GET /v1/skills/jobs/<ID>`、`GET /v1/status` だけを使います。Cloudflare経路ではAccessの2ヘッダーとBearerトークンを、Tailscale経路ではBearerトークンを送信します。ブラウザーからの生成要求はすぐにジョブ番号を返し、最大4件を順番に処理します。前のキャラクターを生成中でも次のキャラクターを送信できます。生成結果は画面がポーリングして取得します。1アカウントとPCゲートウェイの上限はそれぞれ1時間120件です。ゲートウェイは認証、6KBの入力制限、同時実行1件、待ち行列最大4件、生成タイムアウト、24KBの出力制限を実装しています。秘密情報やAAをログに出しません。

認証なしのアクセスと誤ったBearerトークンが拒否されることを確認してから、公開ゲームでログインし、AA生成とPvE/PvPでの使用を試します。PCやTunnelが停止した場合、生成はエラーになりますが、ログイン、既存キャラ、対戦、トレード、Neon保存は動作し続けます。Cloudflareの設定値はまだリポジトリには含まれません。

