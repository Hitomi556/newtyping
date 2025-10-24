# Eigo Bubble - 英単語タイピング学習アプリ

## プロジェクト概要

**Eigo Bubble**は、英検5級から1級までの英単語をタイピング練習を通じて学習できるWebアプリケーションです。

### 主な機能

1. **学習追跡** - 進捗が自動で保存され、毎日の成果を見える化
2. **スマート復習** - 間違えた単語を自動分析し、効率的に再出題
3. **タイピング練習** - 連続二回正解で習得カウントされる楽しい練習モード
4. **音声モード** - 日本語音声を聞いて英単語を入力する練習モード
5. **管理画面** - 単語の追加・編集・削除、CSV一括インポート機能

## 📍 公開URL

- **本番環境**: https://newtyping.pages.dev （固定URL）
- **管理画面**: https://newtyping.pages.dev/admin
  - ユーザー名: `hawai1214`
  - パスワード: `canada2023`
- **GitHub**: https://github.com/Hitomi556/newtyping

## 🎯 完成した機能

### ユーザー機能
- ✅ 英検5級〜1級の級選択画面
- ✅ **2つの難易度モード**
  - 🔥 **挑戦モード**: 頭文字＋アンダースコアのヒントのみ（本気で覚えたい人向け）
  - 🎓 **練習モード**: 1文字だけ空欄＋日本語訳表示＋自動音声再生（楽しく学びたい人向け）
- ✅ **充実の結果画面オプション**
  - 🔄 もう一度（同じ問題セットを再挑戦）
  - ➡️ 次に進む（新しい10問に挑戦）
  - 🔥 挑戦モードで行う（同じ問題を挑戦モードで）
  - 🏠 ホームに戻る
- ✅ タイピング練習機能（テキストモード・音声モード）
- ✅ リアルタイム統計表示（正解数、正答率、残り問題数）
- ✅ 入力ミスの即時フィードバック（赤文字表示）
- ✅ 学習進捗の自動保存
- ✅ 今日の正解数・単語習得数・連続学習日数の統計表示
- ✅ ゴーストテキスト表示（入力補助）
- ✅ スキップ機能
- ✅ **忘却曲線ベースのスペースドリピティション（SRS）**
  - ✨ SM-2アルゴリズムによる最適な復習スケジューリング
  - ✨ 学習開始済み級のみ復習予定を表示（localStorage管理）
  - ✨ 復習期限が来た単語を優先的に出題
  - ✨ 復習間隔: 1日 → 6日 → 指数的に増加

### 管理機能
- ✅ 単語一覧表示（ページネーション付き）
- ✅ 単語の追加・編集・削除
- ✅ **CSV一括インポート（改善版）**
  - ✨ 引用符付きフィールド対応
  - ✨ カンマを含むテキストに対応
  - ✨ エスケープされた引用符に対応
  - ✨ サンプルCSVボタンで簡単テスト
  - ✨ 詳細なエラーメッセージ表示
- ✅ 級別フィルタリング
- ✅ Basic認証による管理画面の保護

### その他のページ
- ✅ 利用規約ページ
- ✅ お問い合わせページ（EmailJS統合）

## 🛠 技術スタック

- **フレームワーク**: Hono (Cloudflare Workers)
- **データベース**: Cloudflare D1 (SQLite)
- **フロントエンド**: HTML, CSS, JavaScript, TailwindCSS
- **ビルドツール**: Vite
- **デプロイ**: Cloudflare Pages
- **プロセス管理**: PM2

## 📦 データモデル

### eiken_levels（英検級テーブル）
- id, level_name, display_name, created_at

### words（単語テーブル）
- id, english, japanese, level_id, part_of_speech, example_sentence, created_at

### progress（学習進捗テーブル）
- id, word_id, user_id, correct_count, incorrect_count, consecutive_correct, is_mastered, mastered_at, last_practiced, mode, created_at
- **SRSフィールド**: easiness_factor, repetitions, interval_days, next_review_date, review_stage

## 🚀 開発環境のセットアップ

### 1. 依存関係のインストール
```bash
cd /home/user/webapp
npm install
```

### 2. D1データベースのセットアップ
```bash
# マイグレーション実行
npm run db:migrate:local

# サンプルデータの投入
npm run db:seed
```

### 3. ビルド
```bash
npm run build
```

### 4. 開発サーバーの起動
```bash
# PM2で起動（推奨）
pm2 start ecosystem.config.cjs

# または直接起動
npm run dev:d1
```

### 5. サービスの確認
```bash
# ステータス確認
pm2 list

# ログ確認
pm2 logs eigo-bubble --nostream

# サービステスト
curl http://localhost:3000
```

## 📝 APIエンドポイント

### ユーザーAPI
- `GET /api/levels` - 級一覧の取得
- `GET /api/words/:levelId` - 特定の級の単語一覧
- `GET /api/quiz/:levelId` - ランダムに単語を取得（復習期限優先）
- `POST /api/progress` - 学習進捗の記録（SRSパラメータ自動計算）
- `GET /api/stats/:levelId` - 統計情報の取得
- `GET /api/mastery/global` - グローバル習得統計
- `GET /api/mastery/level/:levelId` - 級ごとの習得チェック
- `POST /api/reset-level-progress` - 級の進捗をリセット
- `GET /api/review-due/:levelId` - 復習予定数の取得（SRS）

### 管理API（Basic認証必要）
- `GET /api/admin/words` - 全単語の取得
- `POST /api/admin/words` - 単語の追加
- `PUT /api/admin/words/:id` - 単語の更新
- `DELETE /api/admin/words/:id` - 単語の削除
- `POST /api/admin/import-csv` - CSV一括インポート（改善版）
  - 引用符対応の高度なCSVパーサー
  - レベルIDのバリデーション（1-10）
  - 詳細なエラーレポート

## 📊 現在の単語データ

- **5級**: 10語（hello, cat, dog, book, apple など）
- **4級**: 10語（beautiful, interesting, difficult など）
- **3級**: 10語（however, therefore, although など）
- **準2級〜1級**: 未登録（管理画面から追加可能）

## 🔄 次のステップ

1. **単語データの拡充** - 管理画面のCSV一括インポート機能を使用して各級の単語を大量追加
2. **機能拡張**
   - ユーザー認証機能
   - 学習レポート機能
   - ランキング機能
   - 学習リマインダー
   - エクスポート機能（学習データのバックアップ）

## 💡 使い方

### ユーザー向け
1. トップページで級を選択
2. テキストモードまたは音声モードを選択
3. 表示される日本語に対応する英単語を入力
4. 連続2回正解で単語を習得
5. 間違えた単語は自動的に復習リストに追加

### 管理者向け
1. `/admin`にアクセス（ユーザー名: hawai1214, パスワード: waikiki1101）
2. 「単語追加」タブから単語を個別追加
3. または「CSV一括インポート」タブからCSVで一括登録
   - 📝 CSVフォーマット: `english,japanese,level_id,part_of_speech,example_sentence`
   - 💡 「サンプルCSVを挿入」ボタンでフォーマット例を確認可能
   - ✅ カンマや引用符を含むデータも正しく処理
   - 📊 インポート結果の詳細レポート表示
4. 「単語一覧」タブで既存単語の編集・削除

## 📄 ライセンス

© 2025 Eigo Bubble. All rights reserved.

## 📞 お問い合わせ

アプリ内の「お問い合わせ」ページからご連絡ください。

---

**最終更新日**: 2025-10-22
**ステータス**: ✅ 本番稼働中
**プロダクションURL**: https://newtyping.pages.dev （固定URL）
**デプロイ環境**: Cloudflare Pages（グローバル配信）
**最新の改善**: クイズAPIを改善 - JavaScriptシャッフルで毎回異なる問題を出題
