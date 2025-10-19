# Cloudflare Pages デプロイ手順

## 📋 事前準備

1. Cloudflareアカウントを作成（無料）: https://dash.cloudflare.com/sign-up
2. Cloudflare APIトークンを取得

## 🔑 ステップ1: Cloudflare APIキーの設定

### APIトークンの作成方法

1. Cloudflareダッシュボードにログイン: https://dash.cloudflare.com
2. 右上のアイコン → 「My Profile」をクリック
3. 左メニューから「API Tokens」を選択
4. 「Create Token」ボタンをクリック
5. 「Edit Cloudflare Workers」テンプレートを使用
6. または以下の権限でカスタムトークンを作成:
   - **Account - Cloudflare Pages - Edit**
   - **Account - Account Settings - Read**
7. 「Continue to summary」→「Create Token」
8. 表示されたトークンをコピー（一度しか表示されません）

### サンドボックスでのAPIキー設定

- 左サイドバーの「**Deploy**」タブを開く
- コピーしたAPIトークンを入力して保存

## 🗄️ ステップ2: 本番用D1データベースの作成

```bash
cd /home/user/webapp

# D1データベースを作成
npx wrangler d1 create webapp-production
```

**重要**: 出力されたdatabase_idをコピーしてください。

例:
```
[[d1_databases]]
binding = "DB"
database_name = "webapp-production"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### wrangler.jsoncを更新

`database_id`を実際の値に置き換えてください：

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "webapp",
  "compatibility_date": "2025-10-19",
  "pages_build_output_dir": "./dist",
  "compatibility_flags": [
    "nodejs_compat"
  ],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "webapp-production",
      "database_id": "ここに実際のIDを入力"
    }
  ]
}
```

## 📊 ステップ3: データベースのセットアップ

```bash
# マイグレーションを実行（テーブル作成）
npx wrangler d1 migrations apply webapp-production

# サンプルデータを投入（オプション）
npx wrangler d1 execute webapp-production --file=./seed.sql
```

## 🚀 ステップ4: Cloudflare Pagesプロジェクトの作成

```bash
# Pagesプロジェクトを作成
npx wrangler pages project create webapp --production-branch main
```

## 🔐 ステップ5: 管理画面の認証情報を設定

```bash
# ADMIN_USERNAMEを設定
npx wrangler pages secret put ADMIN_USERNAME --project-name webapp
# プロンプトが表示されたら: hawai1214 と入力

# ADMIN_PASSWORDを設定
npx wrangler pages secret put ADMIN_PASSWORD --project-name webapp
# プロンプトが表示されたら: waikiki1101 と入力
```

## 📦 ステップ6: ビルドとデプロイ

```bash
# プロジェクトをビルド
npm run build

# Cloudflare Pagesにデプロイ
npx wrangler pages deploy dist --project-name webapp
```

デプロイが成功すると、URLが表示されます：
```
✨ Success! Uploaded 5 files (2.34 sec)

✨ Deployment complete! Take a peek over at
   https://xxxxxxxx.webapp.pages.dev
```

## 🌐 ステップ7: カスタムドメインの設定（オプション）

Cloudflareダッシュボードから：
1. 「Workers & Pages」→ プロジェクト「webapp」を選択
2. 「Custom domains」タブ
3. 「Set up a custom domain」をクリック
4. ドメイン名を入力して追加

または、コマンドラインから：
```bash
npx wrangler pages domain add your-domain.com --project-name webapp
```

## 🔄 今後の更新方法

コードを更新したら：

```bash
# 変更をコミット
git add .
git commit -m "Update feature"
git push origin main

# 再ビルド・再デプロイ
npm run build
npx wrangler pages deploy dist --project-name webapp
```

## 📝 便利なコマンド

```bash
# デプロイ履歴を確認
npx wrangler pages deployment list --project-name webapp

# プロジェクト情報を確認
npx wrangler pages project list

# シークレットを確認
npx wrangler pages secret list --project-name webapp

# D1データベースの内容を確認
npx wrangler d1 execute webapp-production --command="SELECT * FROM eiken_levels"

# ログを確認
npx wrangler pages deployment tail --project-name webapp
```

## ⚠️ トラブルシューティング

### 認証エラーが出る場合
```bash
# 再度ログイン
npx wrangler login
```

### データベースが見つからない
```bash
# D1データベース一覧を確認
npx wrangler d1 list

# wrangler.jsoncのdatabase_idが正しいか確認
```

### デプロイが失敗する
```bash
# ビルドエラーをチェック
npm run build

# wranglerのバージョンを確認
npx wrangler --version
```

## 💡 ベストプラクティス

1. **環境変数の管理**
   - ローカル: `.dev.vars`（gitignoreに含まれる）
   - 本番: `wrangler pages secret put`で設定

2. **データベースのバックアップ**
   ```bash
   # データをエクスポート
   npx wrangler d1 export webapp-production --output=backup.sql
   ```

3. **ステージング環境**
   ```bash
   # ステージング用のブランチをデプロイ
   npx wrangler pages deploy dist --project-name webapp --branch staging
   ```

## 📚 参考リンク

- Cloudflare Pages ドキュメント: https://developers.cloudflare.com/pages/
- Cloudflare D1 ドキュメント: https://developers.cloudflare.com/d1/
- Wrangler CLI ドキュメント: https://developers.cloudflare.com/workers/wrangler/

---

**最終更新**: 2025-10-19
