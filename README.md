# 公共交通オープンデータチャレンジ2026 企画フォルダ

**方針: 案3+「アメミチ3D」で進める（2026-10-17 決定）。** 作業は `20_案3plus/` で行う。

応募締切は 2027-01-11 23:59。最初の判断ゲートは 10/31（港区の1箇所で3D水位表現がスマホで動くか）。

## フォルダ構成

| フォルダ | 中身 |
| --- | --- |
| `00_前提資料/` | コンテストの開催概要・審査分析と、優勝提案の調査レポート。読み物として固定 |
| `10_候補案/` | 検討した案1〜案3の企画まとめ。比較の記録として残す（更新しない） |
| `20_案3plus/` | 進行中の案。企画書、開発計画、データ、未決事項 |
| `20_案3plus/data/raw/` | 取得したままの原本 |
| `20_案3plus/data/processed/` | 加工済みデータ（注意箇所159件の CSV など） |
| `20_案3plus/design/` | 画面設計・デザイン素材の置き場 |
| `20_案3plus/pitch/` | 応募書類・デモ動画・プレゼンの置き場 |

## まず読むもの

1. `HANDOVER.md`（他PC引き継ぎ書・最新の実装状況・重要ノウハウまとめ）
2. `20_案3plus/01_企画書_案3plus.md`
3. `20_案3plus/02_開発計画とタスク.md`
4. `20_案3plus/04_未決事項と確認事項.md`

## 💻 別PCでの開発再開手順（クイックスタート）

別のPCで開発を引き継ぐ場合は、以下のコマンドを実行してください。

```bash
# 1. リポジトリのクローン
git clone https://github.com/junichikatsu/open-data-challenge2026.git
cd open-data-challenge2026

# 2. develop ブランチに切り替え（※デフォルトブランチは develop です）
git checkout develop
git pull origin develop

# 3. 依存パッケージのインストール
npm install

# 4. ローカル開発サーバー起動
npm run dev
# -> ブラウザで http://localhost:5173/ を開く
```

> [!NOTE]
> - `node_modules/` および `dist/` は `.gitignore` に設定されています。絶対に Git コミットに含めないでください。
> - 各機能の実装履歴や技術的な落とし穴・解決策（3D DEM タイル選定や MapLibre 制約など）の詳細は [`HANDOVER.md`](./HANDOVER.md) を参照してください。

## オンライン資料

| 資料 | リンク |
| --- | --- |
| 3案比較と推奨（Claude Docs） | https://claude.ai/code/artifact/288d211c-2826-4f24-9ae9-7f4dbe3e553d |
| 案1 企画書（Claude Docs） | https://claude.ai/code/artifact/20c32208-884e-4e6f-9015-51218ea3a986 |
| 案1 プレゼン | https://claude.ai/artifact/Y6AU32qCoF4tdh2a5VbP6k |
| 案2 プレゼン | https://claude.ai/artifact/GnEZov25fYpTGrA2vM7Dh2 |
| 案3 プレゼン（案3+への更新前） | https://claude.ai/artifact/3qDsmAmLviJVAczEHdgjU3 |
| 流用元リポジトリ | https://github.com/junichikatsu/yorimichi-quest |

オンライン資料は作成者のみ閲覧可の状態。チームに見せるときは各ページの共有メニューから共有する。
