# GROWI ペラWikiの移植

技術Wikiの入口は、カーボンモノコックマニュアルと製作日記を工程ごとに照合したページです。左にページツリー、中央に本文、右に目次を置き、ページリンクは `#library/wiki/<id>` へ変換します。URLの再読込、戻る・進む、本文検索、Markdown原文、表・数式・添付の表示に対応します。既存の工程モニターと、記録から作るWikiは維持します。

## データの境界

- 原文と添付本体は `.data/growi/` に保全し、GitとVercelの送信対象から除外します。パスワード・Cookieはプロセス内で使用し、ファイルへ保存しません。
- 配信する本文は既存の `propeller_wiki_sources` の `growi-archive-v1` に保存します。`propeller_wiki_access` に登録された工房のメンバーだけがRLS経由で取得できます。
- 添付は既存の非公開 `propeller-wiki-media` バケットにSHA-256を名前として保存します。クライアントは認証して取得し、容量とSHA-256を照合してから表示します。
- 原文をLocal Storage・IndexedDB・Service Workerへキャッシュしません。公開ビルドには本文・画像・元Wikiの認証情報を含めません。
- 移植するのは取得時点の本文と版ID・著者・日付・添付です。過去の各版本文や元Wikiの編集機能は別途実装が必要です。コメント件数は記録し、原サイトへの導線を残します。
- 取得不能のページと添付を空の成功結果として扱わず、画面と検証レポートに残します。

## 取得と検証

管理者がプロセス環境へ `GROWI_USERNAME` / `GROWI_PASSWORD` を設定し、`node scripts/export-growi.mjs --media` を実行します。対象は `/ペラ` 配下のみです。本文取得後、添付を取得して容量とSHA-256を保存します。再開時は取得済みの版と添付を利用します。

統合ページの原稿を `.data/growi/home.md` に用意し、`DISCORD_ARCHIVE` と `DISCORD_WIKI_BACKUP` を保全済みの一次アーカイブ・Wiki下書きへ向けて `node scripts/prepare-growi-package.mjs` を実行します。`node scripts/verify-growi.mjs` で本文・添付・本文中の添付参照を照合できます。原稿も生成JSONも非公開データです。

本文の登録では既存レコードの有無を先に確認し、新規移植は `ON CONFLICT DO NOTHING` とします。更新する場合は取得時の版IDまたは既知の更新日時を条件にし、既存の別データを無条件に置き換えません。

## 添付配置（管理者の接続が必要）

既存の管理者用Storage接続によるアップロードを利用します。代替の一時取込関数 `supabase/functions/wiki-ingest/index.ts` はレビュー用の実装であり、この変更だけで自動配備されません。配備には管理者の明示承認が必要です。

この関数を承認して使う場合は、ランダムな256-bitトークンのSHA-256・短い有効期限・許可するファイルのハッシュと容量だけを `growi-import-session` に登録します。関数は独自の認証を必須とし、対象バケットが非公開であること、ファイルのハッシュと容量、保存後の再取得を確認します。別のファイルや既存内容の上書きは許可しません。終了時にセッションを失効させ、関数を停止します。サービスキーはSupabase内部だけで使い、クライアントへ返しません。

## 確認

`npm run typecheck`、`npm test`、`npm run build`、`npm run test:e2e`、`npm run test:offline` を実施します。ブラウザー試験は通常の架空資料を使います。実資料のPC・スマホ表示はローカルで `GROWI_QA_ARCHIVE=.data/growi/package.json` を指定した場合だけ確認し、スクリーンショットは `.verification/` に保存します。
