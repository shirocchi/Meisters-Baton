# アプリ内Wikiの参照方法

通常の動画制作は、アプリ内Wikiと取り込み済みMeister Wikiを参照する。元Wikiのログイン、Chromeのセッション、Computer Useは不要。元WikiのURLは出典情報であり、制作時の取得先ではない。

## データと優先順位

| 内容                           | 保存先・実装                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| 取込Wiki・統合本文・日記・図鑑 | `propeller_wiki_sources` の `growi-archive-v1`。`src/lib/growiWiki.ts`                   |
| アプリの編集・記録の追記       | 対象工房の `wiki_page_edits`。`src/wikiState.tsx` と同じくページIDで本文へ重ねる         |
| 作業記録Wikiと根拠             | `team_state.data.articles` と `recordings`。未同期の端末変更はアプリのバックアップで補う |
| 取込添付                       | 非公開 `propeller-wiki-media` のSHA-256名のオブジェクト                                  |
| 一部の図・模型                 | 添付の `sourceSlug` が指す `propeller_wiki_sources` のbase64行                           |
| アプリ追加の添付・映像         | 非公開 `team-media` の現在の工房配下                                                     |
| 標準搭載の公開工程ガイド       | `src/domain/propellerWiki.ts`。探索の手掛かりであり、特定世代の実績の一次資料ではない    |

取込原文・アプリの編集版を両方残す。最新の更新日と製法の対象年代を混同しない。下書き、AI解析、承認済みの状態を区別する。

## オンライン取得

リポジトリルートで `npm ci` の後、`npm run wiki:context -- --help` を確認する。補助スクリプトはGETのみを使い、DB・Storageへ書き込まない。

実行プロセスに、アプリと同じ `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`、本人の `BATON_ACCESS_TOKEN`、対象工房の `BATON_TEAM_ID` を設定する。JWTはアプリの正規のSupabase認証で取得したものを呼び出し側が渡す。このCLIにログインUIはなく、`.env` の自動読込もしない。

トークンをチャット・引数・成果物・Gitへ書かない。ブラウザーのCookieや他人のセッションを取り出さない。元Wikiのパスワード、Supabaseのservice_roleキーは使わない。各読み取りにSupabaseの認証・RLSが適用される。

```powershell
npm run wiki:context -- --query "外皮 積層" --out .data/process-videos/skin-01/references/wiki
```

`README.md`、`context.json` と対象ページのMarkdownを読む。検索は語の一致による候補抽出で、既定は12件。`coverage.matches` と `selected` に差があれば `--limit` を増やすか、工程・部品・年代を変えて追加検索する。前後工程とアプリ内リンク先も確認する。全資料を読んだとは扱わない。

画像・映像を使う対象に絞り、新しい出力先で `--media` を付けて再実行する。

```powershell
npm run wiki:context -- --query "外皮 積層" --out .data/process-videos/skin-01/references/wiki-media --media
```

添付IDと保存先は `context.json.assets` で対応付ける。取込添付は容量・SHA-256を照合する。アプリ追加メディアにサーバー側ハッシュがなければ、取得後のローカルハッシュとして区別する。取得は実見ではない。画像・図面・動画の実体を表示して確認する。Markdownの元URLを開く代わりに保存済み添付を使い、未知の参照先を推測で埋めない。

読み取りは同一DBトランザクションではない。制作中に資料が更新されたら新しいスナップショットで照合する。別工房の編集と、未同期の端末変更は取得に含まれない。

## オフライン資料

権限のある人から受け取ったアプリ用アーカイブ、編集行のJSON配列、アプリのバックアップを使える。ファイルの実在・形式・取得日を確認し、別PCや別worktreeの絶対パスを固定しない。

```powershell
npm run wiki:context -- --archive .data/growi/package.json --edits .data/wiki-edits.json --backup .data/app-backup.json --query "外皮 積層" --out .data/process-videos/skin-02/references/wiki --media --media-dir .data/growi/media
```

- `--edits`、`--backup` はある場合だけ指定する。省略は「未取得」であり、編集0件を確認した空配列とは異なる。
- `--archive .data/growi/archive.json` も対応するが、初回原文だけなら後から追加された統合本文・図鑑・編集版は含まれない。
- `--media-dir` はSHA-256名で保存した添付の場所。別途DBや `team-media` に保存された実体がなければ未取得として残る。
- アプリの通常バックアップには取込Wiki本文・添付本体は入らない。バックアップ単独で全Wikiを参照できるとは説明しない。
- オフライン資料は取得時点の状態で、現在のアプリと一致するかは未確認とする。

## 取得できない場合

- 401・403、期限切れ、工房非所属：本人のアプリ認証と所属を確認する。
- 取込Wikiが0件：不存在と断定せず、管理者に `propeller_wiki_access` の許可と配置状態を確認してもらう。編集の取得失敗も古い本文へ無言で切り替えない。
- 検索0件：用語・対象・取得範囲を見直す。全Wikiに記載がないとは断定しない。
- 欠落・未取込のページや添付：不足として残し、必要ならアプリへの追加インポートを別作業として扱う。元Wikiへのブラウザーアクセスを自動代替にしない。

2026-09-09の取り込みは「ペラ」配下61項目中、本文60件と添付59実ファイルの取得記録がある。Wiki全サイト・全改訂・全添付の完全コピーではない。現在のアーカイブの欠落フラグと対象工程の根拠を確認する。

## 保存と組み込みAI

出力は新規の `.data/` 配下へ保存する。原データを上書きせず、認証値・全文・添付・生成コンテキストを公開Gitや公開ビルドへ追加しない。開発者の明示的な書き出しと、アプリのIndexedDB・Service Workerへの自動キャッシュは別で、後者は追加しない。

これは開発用Codexのスキルであり、登録だけでアプリ内AIが動くものではない。アプリ内AIに接続する際も、呼出元利用者の認証・工房・閲覧権限で取得し、必要な本文と取得できたメディアをモデルへ渡す。元サイトのセッションやGitHubの公開化は不要。AI送信の同意を維持し、Wikiの編集・公開は動画制作と別の操作として扱う。
