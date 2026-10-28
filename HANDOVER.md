# アメミチ 3D (Amemichi 3D) - 引き継ぎ書 (Handover Document)

**作成日時**: 2026-10-17  
**対象コンテスト**: 公共交通オープンデータチャレンジ2026（最優秀賞・優勝を目標）  
**企画コンセプト**: 電車が止まった雨の日、くぐらずに帰る。

---

## 1. プロジェクトの背景とコアバリュー
- **テーマ**: 豪雨等による鉄道運転見合わせ時における「アンダーパス・地下道冠水」と「駅出入口の選択ミスによる被災・滞留」を未然に防ぐフェーズフリーな3D公共交通ナビゲーションシステム。
- **データ融合**:
  - **ODPT 公共交通オープンデータ**: 駅出入口（GTFS-Pathways）・運行情報（GTFS-RT）・都営バス路線形状（GTFS shapes）
  - **国交省道路防災情報**: アンダーパス注意箇所（2026-10-06改定 4区分判定基準）都内159箇所
  - **国土交通省 Project PLATEAU**: 港区LOD1/LOD2 3D都市モデル（ペデストリアンデッキ・高架避難路）
  - **地理院・標高データ**: AWS Open Data Terrain-RGB（Terrarium DEM）による高低差・すり鉢状窪地可視化
  - **市民協働**: 平常時の現地設備3値チェック（見てきた報告）によるデータ即時更新

---

## 2. Git ブランチ運用ルール（最重要）
- **デフォルトブランチ**: `develop`（GitHubリポジトリ設定済み）
- **フィーチャーブランチ運用**:
  - 必ず `develop` からブランチを作成（例: `feature/issue-XX-description`）
  - 実装・検証後、`gh pr create --base develop` で PR を作成
  - PR マージ（`gh pr merge XX --merge --delete-branch`）後に `develop` を pull
- **コミット厳禁ルール**:
  - **`node_modules/` および `dist/` は絶対にコミットしないこと**（`.gitignore` 設定済み）

---

## 3. 実装完了機能一覧（PR履歴）

| PR | ブランチ / 機能 | 内容 |
|---|---|---|
| **#2** | `feature/issue-1-gate1-prototype` | ゲート1プロトタイプ（MapLibre GL + 3D DEM地形 + 港区アンダーパス5箇所 + 雨量スライダー0〜100mm/h + 国交省4区分判定ダッシュボードCSV出力） |
| **#4** | `feature/issue-3-plateau-3d-buildings` | PLATEAU 3D建築物レイヤー（世界貿易センタービル、ポートシティ竹芝、クレアタワー等）＋ヘッダー操作ボタン統合 |
| **#6** | `feature/issue-5-toei-bus-gtfs` | 都営バス GTFS shapes 重畳（都06系統＝安全代替幹線、浜95系統＝冠水注意路線）＋豪雨時迂回アラート連動 |
| **#8** | `feature/issue-7-amemichi-maker` | 平時モード「アメミチづくり」（地図クリックによるルート自作描画＋幾何最短距離計算による100点満点安全度採点＋S/A/B/Cランク診断モーダル＋豪雨耐水テスト） |
| **#10** | `feature/issue-9-mitekita-reporting` | 平時モード「見てきた」（現地設備3値アンケート報告機能）＋豪雨時危険防止フェイルセーフ＋管理者ダッシュボード即時同期 |
| **#12** | `feature/issue-11-scenario-player` | 豪雨時モード「17:15 シナリオ再生エンジン」（16:50降雨開始 → 17:10急変 → 17:15地下鉄全線見合わせ発令 → 17:20アメミチ安全推奨ライン自動描画＆都06バス・高台誘導）＋倍速切替・シネマティックカメラワーク |
| **#14** | `feature/issue-13-tokyo-159-underpasses` | 東京都全域159箇所アンダーパス網羅データ（`apps/amemichi-3d/public/data/tokyo_underpass_159.geojson`）＋エリアセレクタ＋管理者ダッシュボード検索・絞り込みフィルター |
| **#16** | `feature/issue-15-gh-pages-and-readme` | GitHub Pages 自動デプロイCI/CD（`.github/workflows/deploy.yml`）＋Viteベースパス最適化＋審査員向け受賞仕様README.mdブラッシュアップ |
| **#18** | `feature/issue-17-odpt-status-board` | ODPT リアルタイム運行情報ステータス盤＆豪雨運休シミュレータ（都営地下鉄4路線＋都営バス＋JR）＋模擬運休注入＋本番API連携設定＋避難ナビ双方向連動 |
| **#20** | `feature/issue-19-pathways-and-shelters` | 駅出入口（GTFS-Pathways）および一時滞在施設の3Dマーカー拡充（大門・浜松町・三田・田町・汐留18件）＋冠水危険/安全出口動的ハイライト＋ヘッダートグル |
| **#22** | `feature/issue-21-mobile-responsive-optimization` | スマートフォン表示（レスポンシブ）とボトムシートUIドロワーの全面最適化（390px幅でのヘッダー2列多段配置、下部ボトムシートスライドアップ＆ハンドルタップ収納、親指操作特化UI） |
| **#24** | `feature/issue-23-ogp-and-pwa-assets` | SNSシェアOGP画像（1200x675・高品質軽量JPG）・Twitter Cards・ファビコン（SVG/PNG）・PWA Web App Manifest（`manifest.json`）の整備とメタタグ最適化 |
| **#26** | `feature/issue-25-pitch-materials` | 審査応募書類ドラフト（`docs/20_案3plus/pitch/01_コンテスト応募書類ドラフト.md`）および審査用1分デモ動画絵コンテ・タイムライン構成案（`02_1分デモ動画_絵コンテ構成案.md`）の策定 |
| **#28** | `feature/issue-27-demo-video-mp4` | 審査応募用 1分デモ動画（Full HD 1080p, H.264/AAC, 60.0秒, 2.6MB）の自動レンダリング・配置（`docs/20_案3plus/pitch/amemichi_demo_1min.mp4`） |

---

## 4. 蓄積された重要技術ノウハウ（落とし穴と解決策）

1. **3D Terrain DEM タイルの選定**:
   - 産総研・国土地理院の GSJ タイル（`https://tiles.gsj.jp/...`）は 404 を返し、MapLibre が NaN 行列を計算して黒画面クラッシュ（`failed to invert matrix`）を起こす。
   - **必ず AWS Open Data の Terrarium タイル（`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, encoding: 'terrarium'）を使用すること**。
2. **ベースマップ スタイル**:
   - CartoDB Dark Matter ベクタースタイル（`https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`）を使用。洗練されたダークテーマで3D地形・建物の発光表現が最も美しく映える。
3. **MapLibre GL JS のプロパティ制約**:
   - `line-dasharray` はデータ駆動式（`['case', ...]`）をサポートしないため、線色（`line-color`）や線幅（`line-width`）でスタイル切替を行うこと。
4. **DOM要素のイベントリスナー登録**:
   - ヘッダーツール等のUI変更時、要素が削除・置換された場合は必ず `document.getElementById(...)` に null チェックを行うこと（未チェックだと以降の全イベントリスナー登録が中断する）。
5. **アンダーパスピンのヒットボックス強化**:
   - マップ上のアンダーパスは `underpass-points`（中心・半径11px）と `underpass-pulse`（外側波紋・半径18px）の両方にクリックリスナーをバインドすることで、3D視点でもクリックが確実に反応する。
6. **安全設計原則（フェイルセーフ）**:
   - 雨量スライダー >= 50mm/h の豪雨シミュレーション中は、市民が危険箇所を見に行かないよう「見てきた報告」ボタンを自動で disabled（`⚠️ 豪雨時: 安全のため現地調査は停止中`）にする設計を維持すること。
7. **スマートフォン表示（レスポンシブ）とボトムシートUI**:
   - 幅768px（特に390px以下）のスマホでは、ヘッダーを「モードタブ3列等分割」＋「クイックツール2列Wrap」に多段化することで、17:15再生・運行情報・出口トグル等の重要アクションが画面外へ溢れず即時操作可能になる。
   - スポット詳細（アンダーパス・出入口・施設）はPCの右サイドバーから画面下部の「ボトムシート（最大高60vh、角丸18px）」へ切り替え、上部ドラッグハンドル（`#drawer-toggle`）タップでのスライド収納を実装することで、3Dマップの視界と片手操作性を両立。
8. **OGP・Twitter Cards・PWAアセット設計**:
   - `apps/amemichi-3d/public/` ディレクトリ配下に `ogp.jpg`（1200x675・約370KB）、`favicon.svg`、`apple-touch-icon.png`、`manifest.json` を配置することで、Viteビルド時に自動で `dist/` ルートに展開される。
   - GitHub Pages の絶対URL（`https://junichikatsu.github.io/open-data-challenge2026/ogp.jpg`）を `og:image` および `twitter:image` に明記することで、X/Facebook等のクローラーが高速キャッシュ・カード展開可能。
9. **審査応募書類・デモ動画の提出ポイント**:
   - 応募書類には流用元リポジトリ（イマノウチ/ヨリミチ）との関係性と、本コンテストのためにゼロから新規開発した範囲を明確に記載すること（審査の公平性担保）。
   - 1分デモ動画（`docs/20_案3plus/pitch/amemichi_demo_1min.mp4`）は Full HD 1080p（60秒ジャスト）でナレーション・テロップ付きで完成しており、YouTube（限定公開等）にそのままアップロード可能。

---

## 5. 他のPCでの環境構築・起動手順

```bash
# 1. リポジトリのクローン
git clone https://github.com/junichikatsu/open-data-challenge2026.git
cd open-data-challenge2026

# 2. develop ブランチに切り替え
git checkout develop
git pull origin develop

# 3. 依存パッケージのインストール（アプリごとにフォルダが分かれている）
cd apps/amemichi-3d
npm install

# 4. ローカル開発サーバー起動
npm run dev
# -> http://localhost:5173/ で動作
```

---

## 6. 次の推奨ステップ（コンテスト応募手続きの実行）

1. **YouTubeへの動画アップロード（限定公開等）**:
   - `docs/20_案3plus/pitch/amemichi_demo_1min.mp4` をYouTubeにアップロードし、共有リンクを取得。
2. **コンテスト応募フォームへの申請提出**:
   - `docs/20_案3plus/pitch/01_コンテスト応募書類ドラフト.md` のテキストおよびYouTubeリンクを用いて、公共交通オープンデータチャレンジ2026公式応募フォームよりエントリー。

---

以上を次の作業PC・環境へ引き継ぎます。
