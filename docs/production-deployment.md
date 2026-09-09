# GitHubから本番へ反映する運用

正本はGitHubの `main`。Vercelの既存プロジェクト `meisters-baton` と
`kob952/Meisters-Baton` を連携し、Production Branchを `main` とする。

1. 専用Issue／branch／worktreeで開発する。
2. 別タスクの依存変更を取り込み、最新mainへ同期して統合テストを実行する。
3. PRで `web-and-api` と `docker-smoke` が成功したことを確認してマージする。
4. VercelのProduction deploymentが同じマージSHAでReadyになったことと、公開URLのWiki・工房・設定を確認する。

ローカルの未コミット変更を含む手動ビルドを本番へ上書きしない。
公開版だけに変更がある場合、先にソースをPRでmainへ取り込む。
Git連携時のVercelビルドはPRの必須CIの代わりではない。

## 設定

- Framework: Vite
- Root Directory: リポジトリルート
- Build: `npm run build`
- Output: `dist`
- Production変数: `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`
- サービスキーやDiscordトークンを `VITE_*` に登録しない。
- Previewへ本番の非公開資料を複製しない。認証境界のCIは架空のSupabase URLとモックデータで試験する。

SupabaseのマイグレーションはVercelのフロントエンドビルドでは実行されない。
今回はチーム認証とWikiの3件が既に適用済みであることを照合した。
Wikiマイグレーションのファイル名は実DBの適用履歴 `20260909053648` に一致させ、重複適用を防ぐ。

## 公開資料の境界

標準Wikiの構造・模式図は公開コード。Discord由来の本文・引用・添付は非公開バックエンド。
旧変換ツールの下書き仕様は `--specs` で非公開JSONを渡し、公開コードに原文由来の本文や実投稿IDを埋め込まない。
写真・動画9件の初期配置は別途管理者接続が必要で、本番デプロイだけでは完了しない。
