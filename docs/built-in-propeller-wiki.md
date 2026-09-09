# 標準プロペラWiki

## 公開構造と非公開一次資料

- 技術Wikiの入口 `#library` は標準搭載の8ページ。GROWIのページ階層を参考に、型・ブレード・仕上げ・組立／試験を辿る。
- `#library/propeller/<slug>` は再読込・共有可能なページURL。検索、目次、読書位置と連動する工程モニターを備える。
- モニターはPCのドラッグ／矢印キー、スマホのタッチで移動できる。最小化、位置リセット、一時停止、シーク、動きを減らす設定に対応。
- アニメーションは製作構造を説明する模式図であり、実寸3Dモデル・実録動画・承認済み作業条件ではない。
- 従来の作業記録Wikiは `#library/records` に残す。記録・編集・レビュー・削除・共有を置換しない。
- 公開コードには一般的な構造／説明のみを含める。Discord由来の本文・引用・写真・動画・投稿者・原文URLを含めない。

## 一次資料の配信

前提は既存のSupabase認証、`teams` / `team_members` マイグレーション、およびブラウザ用の公開URL／publishable key。
この変更のマイグレーションはそれらの後に適用する。サービスキーをVITE変数に入れない。

管理者が `propeller_wiki_access` に登録したチームのメンバーだけが、`propeller_wiki_sources` と非公開 `propeller-wiki-media` バケットをSELECTできる。
新規アカウント／新規工房の作成だけでは閲覧できず、クライアントからアクセス権を追加することもできない。
本文はページ単位で認証ヘッダー付きで取得し、添付は操作時に取得する。端末のWikiデータやバックアップに混ぜず、IndexedDB／Service Workerには保存しない。
ログアウト・認証主体変更・ページ移動時は表示を分離し、未完了リクエストを中断する。Blob URLは破棄する。

一次資料は引き続き確認待ちの下書き。元投稿と照合可能にし、未確認の製作条件や安全基準を承認済みに見せない。
通信失敗、権限不足、未配置メディアは明示し、元Discordへの参照を残す。

## 管理者による一度だけの資料配置

エンドユーザーの端末への取り込み操作は不要。一次資料の登録は管理者が非公開バックエンドで行う。
本文の投入ファイルは公開リポジトリへ置かない。`propeller_wiki_sources` の行は `src/lib/propellerSources.ts` のスキーマに従う。
既存の `scripts/build-propeller-wiki.mjs` が生成する非公開バックアップの添付を配置するには、管理者の環境で次を使う。

```powershell
node scripts/upload-propeller-media.mjs --archive "<非公開アーカイブ>" --backup "<非公開Wiki下書きJSON>"
# 上で全添付の容量／SHA-256を確認後、管理者用プロセス環境に
# SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を安全に渡して実行する。
node scripts/upload-propeller-media.mjs --archive "<非公開アーカイブ>" --backup "<非公開Wiki下書きJSON>" --apply
```

既定は通信なしの検証のみ。`--apply` はバケットの非公開設定を検証し、SHA-256をキーに未配置分だけアップロードする。既存ファイルを上書きせず、読戻しのハッシュも確認する。
キーをチャット、コマンド引数、リポジトリ、公開環境変数に書かない。

## 検証と統合条件

- `npm run typecheck`、`npm test`、`npm run build`、`npm run test:e2e`。
- 他タスクとポートが重なる場合は `BATON_TEST_PORT` を指定する。
- `supabase/tests/propeller_wiki_rls.sql` は未ログイン・非所属・許可メンバーの境界を検証し、全変更をROLLBACKする。
- 別タスクの認証と最新UIが未コミットならPRはDraftのまま。統合用コピーで通ったテストも、依存変更の正式な取り込み後に再実行する。古いアプリのままデプロイしない。
- `tests/e2e/propeller-sources.spec.ts` はその認証統合後、`VITE_SUPABASE_URL=https://wiki-test.supabase.co` と架空のpublishable keyを指定したローカルサーバーで `BATON_TEST_SUPABASE=1` を付けて実行する。認証・本文・添付は通信をモックした架空データで、実際の権限制御は別途SQLで検証する。

参考: [GROWIのページレイアウト](https://docs.growi.org/ja/guide/features/page_layout.html)、[Supabase Storageアクセス制御](https://supabase.com/docs/guides/storage/security/access-control)。
