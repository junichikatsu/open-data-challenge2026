# ライナー車窓（京王ライナー 車窓アプリ）

京王ライナーに乗っている時間を楽しむ LINE ミニアプリ。

- **追い抜きカウンター** — 時刻表から、この便が追い抜く列車（各停・急行など）を数え、抜いた瞬間に知らせる
- **車窓ガイド** — この先 4km・線路から 1.2km 以内のスポットを、左手／右手と距離つきで並べる
- **スポット通知** — 近づいたスポットを画面に通知。♡ で保存して「お気に入り」タブで見返せる（LINE ログイン）

enebular クラウド実行環境（ZIP / Node.js 22.x）で動くバックエンド API と、同じ ZIP から同一オリジンで
配信されるフロントエンド。雛形は `enebular-app` スキル（`.claude/skills/enebular-app`）。

```
keio-liner/
├── scripts/
│   ├── build-liner-data.mjs  ODPT → data/generated/liner.json（便ごとの経路・通過時刻・追い抜き）
│   └── build-spots.mjs       OpenStreetMap → data/spots.json（沿線スポット）
├── data/
│   ├── spots.json            リポジトリに入れる（ODbL・出典表示が必要）
│   ├── generated/            git 管理外（ODPT チャレンジ提供データ由来）
│   └── raw/                  git 管理外（取得した生データ）
├── src/                      関数側（Hono）
│   ├── liner/                便データ・スポット・列車ロケーション（ODPT への中継）
│   ├── auth/line.ts          LINE の ID トークン検証（MOCK_MODE では仮ログイン）
│   ├── routes/               liner.ts（読み取り API）/ favorites.ts（お気に入り）
│   └── datastore/            favorites-repo.ts
├── web/src/                  画面（フレームワークなし）。geo.js が位置計算、clock.js が時計とダイヤ判定
└── test/                     enebular 固有の挙動・API・お気に入りの通し確認
```

## データの扱い（必ず読む）

列車データは ODPT の **公共交通オープンデータチャレンジ2026 限定ライセンス**。応募作品以外に使えず、
第三者提供も禁止されている。

- 取得した生データ（`data/raw/`）と生成物（`data/generated/`）は **リポジトリに入れない**（`.gitignore` 済み）
- ODPT のトークンは画面に渡さない。列車ロケーションはサーバが中継し、トークンはレスポンスにもログにも出さない
- 画面のフッタに ODPT と OpenStreetMap の出典を表示している。消さない

## 準備

```bash
npm install
cp .env.example .env     # ODPT_CHALLENGE_TOKEN にチャレンジ用トークンを入れる
npm run data:liner       # ODPT から便データを作る（data/generated/liner.json）
npm run data:spots       # 沿線スポットを作り直すときだけ（data/spots.json はコミット済み）
```

`data:liner` について:

- 時刻表 API は 1 レスポンス 1000 件で打ち切られる。京王線は曜日区分ごとに分けて取っている（超えたら止まる）
- 京王ライナーの通過駅には時刻が無い。前後の停車駅の時刻から **駅間距離で按分して** 通過時刻を推定する
  （画面では推定であることを出典欄に書いている）
- 追い抜きは「前の駅では相手が先に出ていて、次の駅では相手がライナーより後に出る」列車を数える
- ダイヤ改正のあとは取り直して、ビルド・デプロイし直す

## ローカル開発

```bash
npm run dev:web    # 別ターミナル。web の監視ビルド
npm run dev        # http://localhost:8787
```

- `MOCK_MODE=true`（既定）では LINE ログインを模擬し（端末ごとの仮ユーザー）、列車ロケーションも取りに行かない
- データストアはローカルで代替できないので、インメモリ実装に切り替わる。**永続化されない**（再起動で消える）
- 京王ライナーは朝と夕方以降しか走らない。昼間は「デモ再生 ×20」で動きを見る
- 紹介用のリンク: `?trip=Weekday-7003&demo=12` で、その便の発車 12 分後からデモ再生が始まる

```bash
npm run typecheck && npm test
npm run build       # keio-liner-function.zip ができる（liner.json が無いと止まる）
```

## LINE ミニアプリ（LIFF）の準備

1. LINE Developers で **LINE ログイン** チャネルを作る → チャネル ID を `LINE_CHANNEL_ID` に
2. そのチャネルに LIFF アプリを追加する
   - エンドポイント URL: enebular の HTTP トリガー URL（末尾 `/` 付き）
   - サイズ: Full / スコープ: `openid` と `profile`
   - → LIFF ID を `LIFF_ID` に
3. `MOCK_MODE=false` にする

画面は `liff.getIDToken()` の ID トークンを送り、サーバが LINE の検証エンドポイント
（`/oauth2/v2.1/verify`、`client_id` = チャネル ID）で確かめた `sub` をユーザー ID にする。
画面から来たユーザー ID をそのまま信用しない。

## データストア

| テーブル | メインキー | サブキー | 中身 |
| :--- | :--- | :--- | :--- |
| favorites（`DS_TABLE_FAVORITES`） | `userId`（文字列） | `spotId`（文字列） | スポット名・種類・位置・保存時刻・どの便のどの駅付近で保存したか |

- 1 ユーザー × 1 スポット = 1 アイテム。同じスポットの保存は上書き
- 一覧は query 1 回、保存は put 1 回、削除は get + delete の 2 回（月次アクセス数の上限に効く）
- スポットの名前と位置は画面から受け取らず、サーバのスポット一覧から入れる

## API

| メソッド | パス | ログイン | 内容 |
| :--- | :--- | :--- | :--- |
| GET | `/v1/health` | 不要 | 運用確認（commit・configOk など） |
| GET | `/v1/config` | 不要 | ログイン方式・LIFF ID・出典 |
| GET | `/v1/trips?calendar=Weekday` | 不要 | 便の一覧（追い抜き本数つき） |
| GET | `/v1/trips/:id` | 不要 | 1 便の経路・駅ごとの時刻・追い抜き |
| GET | `/v1/spots` | 不要 | 沿線スポット |
| GET | `/v1/live/:trainNumber` | 不要 | 遅れと走行区間（ODPT 列車ロケーションを 20 秒キャッシュして中継） |
| GET | `/v1/me/favorites` | 必要 | 自分のお気に入り |
| PUT | `/v1/me/favorites/:spotId` | 必要 | 保存 |
| DELETE | `/v1/me/favorites/:spotId` | 必要 | 削除 |

## enebular へのデプロイ

初回だけコンソールでの作業がある。

1. コンソールでプロジェクトを作る → `ENEBULAR_PROJECT_ID`
2. データストアに favorites テーブルを作る（メインキー `userId` 文字列 / サブキー `spotId` 文字列）→ テーブル ID
3. `cp .env.deploy.example .env.deploy` して 1・2 の値とアクセスキー、`FN_ODPT_CHALLENGE_TOKEN`・`FN_LINE_CHANNEL_ID`・`FN_LIFF_ID` を入れる
4. `npm run data:liner` で便データを作っておく（ZIP に埋め込まれる）
5. `npm run enebular:init` — ZIP を作ってファイルアセットを登録し、`ENEBULAR_FILE_ASSET_ID` を書き戻す
6. コンソールでクラウド実行環境を作る（そのアセット / ランタイム Node.js 22.x）→ `ENEBULAR_CLOUD_ID`
7. `npm run enebular:config` — HTTP トリガー・タイムアウト・`connectDataStore`・環境変数を一括設定
8. トリガー URL を `ENEBULAR_HTTP_TRIGGER_URL` に入れ、LIFF のエンドポイント URL にも設定する

以降は `npm run enebular:deploy` だけ。

```bash
npm run enebular:check              # 設定の確認（値はマスク表示）
npm run enebular:deploy --dry-run   # enebular を呼ばずに手順だけ確認
npm run enebular:smoke              # デプロイ済みの環境を確認
```

> `.env.deploy` には ODPT のトークンや enebular の鍵が入るのでコミットしない。
> `FN_*` は送った内容で置き換わる。消すと実行環境からもそのキーが消える。

設計の理由と落とし穴は `enebular-app` スキルの `references/` にある。
`test/app.test.ts` は enebular 固有の挙動を固定しているので消さない。
