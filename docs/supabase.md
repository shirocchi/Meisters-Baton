# Supabase共有基盤

更新: 2026-09-09

公開版のアカウント、工房共有、非公開動画はSupabaseで動きます。プロジェクトrefは `bhisyvkkqxxldddjdksm`、リージョンは東京（`ap-northeast-1`）です。従来のNode/SQLite APIを起動しなくてもチーム共有は使えます。

## 構成

- Supabase Auth: メールアドレスとパスワード。
- Postgres: `teams`、`team_members`、`team_state`。
- Storage: 非公開バケット `team-media`。1ファイル50MB上限。
- RLS: ログイン中のユーザーが所属する工房のデータだけ読める。更新は認証済みRPCだけに制限する。
- 招待: 管理者が20桁の招待コードを発行。コードはDB上でSHA-256ハッシュとして保存し、7日で期限切れになる。
- 工房データの同期: 明示的な送信・取得。バージョン競合時は上書きせず停止する。
- 技術Wiki: 閲覧許可のある工房では対象記録を本文へ自動反映する。`wiki_page_edits` と `wiki_page_revisions` に現在の編集・過去版を保存する。[反映条件と編集](wiki-workshop.md)。

## 環境設定

Vite/Vercelに次を設定します。publishable keyはブラウザーへ配布する前提の値で、秘密ではありません。service-role keyは絶対に画面側へ配布しません。

```dotenv
VITE_SUPABASE_URL=https://bhisyvkkqxxldddjdksm.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<Supabaseのpublishable key>
```

## データベース更新

SQLの正本は `supabase/migrations/` です。新規環境ではSupabase CLIをリンクしてマイグレーションを適用します。実行前に対象project refを必ず確認してください。

```sh
npx supabase@2.81.3 link --project-ref bhisyvkkqxxldddjdksm
npx supabase@2.81.3 db push
```

## 運用前の確認

- Supabase AuthのSite URLとRedirect URLsに実際のHTTPS公開URLを設定する。
- メール確認を使う場合は、送信元とSMTPの制限を実アドレスで確認する。
- 管理者と招待メンバーの2アカウントで、招待、送信、取得、動画再生、競合停止を確認する。
- Security AdvisorとPerformance Advisorを更新後に実行する。
- JSON書き出しと元動画の保管手順を決める。DBバックアップはStorageファイル本体のバックアップと同義ではない。
