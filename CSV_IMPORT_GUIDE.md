# CSV一括インポート機能ガイド

## 📋 概要

CSV一括インポート機能が大幅に改善されました。以下の機能を備えた堅牢なCSVパーサーを実装しています。

## ✨ 新機能

### 1. 引用符付きフィールドのサポート
カンマや改行を含むテキストを引用符で囲むことで正しく処理できます。

```csv
english,japanese,level_id,part_of_speech,example_sentence
"hello, world",こんにちは世界,5,表現,"He said, ""Hello, world!"""
```

### 2. エスケープされた引用符のサポート
引用符を含むテキストは、引用符を2つ重ねることでエスケープできます。

```csv
english,japanese,level_id,part_of_speech,example_sentence
quote,引用,4,名詞,"She said ""Yes"" to the proposal."
```

### 3. サンプルCSVボタン
「サンプルCSVを挿入」ボタンをクリックすると、正しいフォーマットのサンプルデータが自動入力されます。

### 4. 詳細なエラーレポート
インポート失敗時に、どの行でエラーが発生したかを詳細に表示します。

### 5. バリデーション強化
- レベルIDは1-10の範囲内である必要があります
- 英単語、日本語、レベルIDは必須項目です
- 各フィールドの空白チェック

## 📝 CSVフォーマット

### 基本フォーマット

```csv
english,japanese,level_id,part_of_speech,example_sentence
apple,りんご,5,名詞,I like apples.
book,本,5,名詞,This is my book.
beautiful,美しい,4,形容詞,She is beautiful.
```

### フィールド説明

| フィールド | 必須 | 説明 | 例 |
|-----------|------|------|-----|
| english | ✅ | 英単語 | apple, beautiful, however |
| japanese | ✅ | 日本語訳 | りんご, 美しい, しかしながら |
| level_id | ✅ | 級ID（1-10） | 5=5級, 4=4級, 3=3級, 2=準2級, 1=2級, 0=準1級, -1=1級 |
| part_of_speech | ❌ | 品詞 | 名詞, 動詞, 形容詞, 副詞 |
| example_sentence | ❌ | 例文 | I like apples. |

### レベルID一覧

| レベルID | 級 |
|----------|-----|
| 5 | 5級 |
| 4 | 4級 |
| 3 | 3級 |
| 2 | 準2級 |
| 1 | 2級 |
| 0 | 準1級 |
| -1 | 1級 |

## 🎯 使用方法

### 1. 管理画面にアクセス
```
https://f8d5e141.webapp-7wz.pages.dev/admin
```

ユーザー名: `hawai1214`  
パスワード: `waikiki1101`

### 2. CSV一括インポートタブを選択

### 3. CSVデータを準備

#### 方法A: サンプルCSVを使用
1. 「サンプルCSVを挿入」ボタンをクリック
2. サンプルデータが自動入力される
3. 必要に応じて編集

#### 方法B: Excelから貼り付け
1. Excelで単語リストを作成
2. セル範囲を選択してコピー
3. テキストエリアに貼り付け
4. 1行目にヘッダー行を追加

#### 方法C: 手動入力
1. 1行目にヘッダー行を入力
2. 2行目以降にデータ行を入力

### 4. インポート実行
「インポート開始」ボタンをクリック

### 5. 結果確認
- 成功件数とエラー件数が表示されます
- エラーがある場合、「エラー詳細を表示」をクリックして詳細を確認

## 📊 サンプルデータ

### 基本的なCSV
```csv
english,japanese,level_id,part_of_speech,example_sentence
apple,りんご,5,名詞,I like apples.
book,本,5,名詞,This is my book.
cat,猫,5,名詞,I have a cat.
dog,犬,5,名詞,My dog is cute.
run,走る,5,動詞,I run every day.
beautiful,美しい,4,形容詞,She is beautiful.
interesting,興味深い,4,形容詞,This book is interesting.
difficult,難しい,3,形容詞,This question is difficult.
important,重要な,3,形容詞,This is very important.
necessary,必要な,3,形容詞,Water is necessary for life.
```

### カンマを含むCSV（引用符使用）
```csv
english,japanese,level_id,part_of_speech,example_sentence
"hello, world",こんにちは世界,5,表現,"He said, ""Hello, world!"""
"yes, I do",はい、そうです,5,表現,"She replied, ""Yes, I do."""
however,"しかしながら、でも",3,接続詞,"However, I disagree."
```

### 品詞と例文を省略したCSV
```csv
english,japanese,level_id,part_of_speech,example_sentence
table,テーブル,5,,
chair,椅子,5,,
window,窓,5,,
```

## ⚠️ 注意事項

### やってはいけないこと
❌ ヘッダー行を削除する  
❌ フィールドの順序を変更する  
❌ レベルIDに範囲外の値を使用する  
❌ 必須項目を空にする

### 推奨事項
✅ 大量データをインポートする前に少量でテスト  
✅ カンマを含むデータは引用符で囲む  
✅ Excelからコピーする場合は1行目にヘッダーを追加  
✅ エラーが出た場合は詳細を確認して修正

## 🐛 トラブルシューティング

### エラー: 「データが不足しています」
- 最低3列（英単語、日本語、レベルID）が必要です
- フィールドが空になっていないか確認してください

### エラー: 「レベルIDが無効です」
- レベルIDは1-10の範囲で指定してください
- 文字列ではなく数値を使用してください

### エラー: 「必須項目が空です」
- 英単語、日本語、レベルIDは必須項目です
- 空白スペースだけの項目は無効です

### インポート後に単語が表示されない
- 「単語一覧」タブで正しい級にフィルタしているか確認
- ページをリロード（Ctrl+Shift+R）してキャッシュをクリア

## 🔧 技術詳細

### CSVパーサーの仕様
- RFC 4180準拠の引用符処理
- Windows/Unix両方の改行コード対応（\r\n, \n）
- エスケープされた引用符のサポート（""）
- フィールド前後の空白トリミング

### APIエンドポイント
```
POST /api/admin/import-csv
Content-Type: application/json

{
  "csv_data": "english,japanese,level_id,part_of_speech,example_sentence\napple,りんご,5,名詞,I like apples."
}
```

### レスポンス例
```json
{
  "success": true,
  "imported": 10,
  "errors": 0,
  "error_details": []
}
```

## 📞 サポート

問題が解決しない場合は、アプリ内の「お問い合わせ」ページからご連絡ください。

---

**最終更新**: 2025-10-19  
**バージョン**: 2.0  
**機能**: CSV一括インポート（改善版）
