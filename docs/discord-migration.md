# プロペラカテゴリの低侵襲Discord移植

この手順は、Meisterサーバーへ常設Botを置かず、管理者が確認できる読み取り専用コードを一度だけ実行して、原文と画像・動画を持ち出すためのものです。利用者アカウントのトークンを使うself-botや、画面スクレイピングは使いません。

## 推奨する責任分界

Meister側の管理者が一時Botを作成し、自分のPCでexportを実行します。開発チームには完成したアーカイブだけを渡します。開発チームはMeister側のBotトークンを受け取りません。取得後はBotをサーバーから削除し、トークンをリセットします。

一時Botが必要なのは、複数人が投稿したチャンネル履歴をDiscordの正式なAPIで一括取得する瞬間だけです。常駐、オンライン待受、メッセージ送信、メッセージ管理、メンバー管理は不要です。既存の管理Botがあり、その管理者がこの読み取りコードを実行できる場合は、新しいBotの追加も不要です。

## 1. Meister側で一時Botを用意する

1. Discord Developer Portalで一時的なApplicationとBotを作る。
2. Bot設定でMessage Content Intentを有効にする。
3. OAuth2の`bot` scopeでサーバーへ追加する。権限は `View Channel` と `Read Message History` だけにする。Administrator、Send Messages、Manage Messages、Manage Channels、Manage Serverは与えない。
4. Botロールに対し、サーバー全体では `View Channel` を許可しない。「プロペラ」カテゴリの権限設定だけで `View Channel` と `Read Message History` を許可する。カテゴリと同期していない子チャンネルは個別に確認する。
5. 「プロペラ」カテゴリを右クリックしてIDを控える。公開スレッドとBotが参加済みの非公開スレッドは自動列挙する。Botが未参加の非公開スレッドは取得できないため、必要ならBotを追加してIDを明示する。

Discord APIにはカテゴリ直下だけを列挙するエンドポイントがありません。そのためカテゴリ書き出し時だけ、サーバーのチャンネル構成メタデータを1回取得し、直後に対象カテゴリの子だけへ絞ります。カテゴリ外のメッセージ履歴は要求せず、カテゴリ外のメタデータも保存しません。export経路は送信・削除・編集APIを呼びません。

## 2. 管理者PCで書き出す

Node.js 22.13以上を用意し、このリポジトリで依存関係を入れます。

```powershell
npm ci
```

Gitに入らない `.env.discord-export` を作り、Botトークンを保存します。トークンをチャットへ貼らないでください。

```dotenv
DISCORD_SOURCE_BOT_TOKEN=ここに一時Botのトークン
```

Discordの「開発者モード」を有効にし、「プロペラ」カテゴリを右クリックしてカテゴリIDをコピーします。次を実行します。

```powershell
node --env-file=.env.discord-export scripts/discord-archive.mjs export `
  --category ここにカテゴリID `
  --out D:\propeller-archive
```

カテゴリ内でも用途外と確認したチャンネルは、IDを明示して除外できます。除外記録は `manifest.json` に残ります。`--exclude-channel`は複数回指定できます。

```powershell
node --env-file=.env.discord-export scripts/discord-archive.mjs export `
  --category ここにカテゴリID `
  --exclude-channel ここに除外チャンネルID `
  --out D:\propeller-archive
```

公開スレッド、フォーラム投稿、Botが参加済みの非公開スレッドは自動取得します。自動列挙に現れない非公開スレッドを追加する場合だけ、管理者が確認したIDを明示的に足します。`--thread`は複数回指定できます。

```powershell
node --env-file=.env.discord-export scripts/discord-archive.mjs export `
  --category ここにカテゴリID `
  --thread ここにスレッドID1 `
  --thread ここにスレッドID2 `
  --out D:\propeller-archive
```

フォーラム/メディアチャンネルの各投稿も公開スレッドとして自動取得します。意図的に対象外とする場合だけ `--skip-forum` を付けます。権限不足のチャンネルやスレッド一覧がある場合、ツールは黙って欠落させず停止します。

停止しても同じコマンドで再実行できます。取得済みの添付は再利用します。完了時に自動検証しますが、受け渡し前にもう一度検証します。

```powershell
npm run discord:archive -- verify --archive D:\propeller-archive
```

`OK: 件数・容量・SHA-256が一致しました。` と表示されることを確認します。アーカイブには次が入ります。

```text
manifest.json       取得範囲、件数、容量、添付SHA-256、メッセージリンク一覧
messages.jsonl      Discordから取得したメッセージ原文
media/              画像・動画・その他添付の実ファイル
```

アーカイブには個人名や写真が入るため、管理者が承認した暗号化・受け渡し経路を使います。受け渡し後、`.env.discord-export`を削除し、Botをサーバーから外してDeveloper Portalでトークンをリセットします。

## 3. 開発チーム側へコピーする

開発チーム側では別のBotトークンを `DISCORD_DESTINATION_BOT_TOKEN` として使います。移植先Botには、対象カテゴリで `View Channel`、`Send Messages`、`Attach Files`、`Manage Webhooks` を許可します。ツールにチャンネルも作らせる場合だけ `Manage Channels` も必要です。Meister側のトークンではmirrorを起動できません。

使用感を保つ場合は、Baton側へカテゴリ、通常チャンネル、フォーラム、スレッドを先に同じ名前で作り、`mirror-existing`を使います。`--include-channel`と`--include-thread PARENT/THREAD`で列挙した場所だけを名前で厳密照合し、指定外には投稿しません。通常スレッドは通常スレッドへ、フォーラム投稿は同名のフォーラムスレッドへ入ります。投稿者名とアイコン、本文、返信関係、画像・動画を保ち、移植記録・時刻・リアクションの注記は足しません。各保存先で日が変わる最初の投稿には `## YYYY/M/D` を付けます。

同じ投稿者の連続メッセージが移植時刻の近さで一塊に見えないよう、見た目の同じWebhook A/Bを交互に使います。元カテゴリ内のDiscordメッセージリンクと返信先は、全投稿後にBaton側の対応メッセージまたはスレッドへ置き換えます。対象外・カテゴリ外・別サーバーのリンクは改変しません。

移植先のアップロード上限を超える画像がある場合、原本はSHA-256検証済みアーカイブへ残したまま、Discord自身が生成した軽量プレビューをBatonへ投稿できます。対象投稿にはプレビューである旨を追記し、`mirror-media.json`へ原本とプレビュー双方の容量・SHA-256対応を残します。

```dotenv
DISCORD_DESTINATION_BOT_TOKEN=ここに開発チーム用Botのトークン
```

既存構造へ移す場合は、まずdry-runします。これはDiscordへ書き込みません。オプションは複数回指定できます。

```powershell
node --env-file=.env.discord-destination scripts/discord-archive.mjs mirror-existing `
  --archive D:\propeller-archive `
  --destination-category ここにBaton側カテゴリID `
  --include-channel ペラ日記 `
  --include-channel ペラ管理室 `
  --include-thread ペラ日記/Swingby `
  --include-thread ペラ管理室/設計管理部 `
  --use-discord-previews-for-oversized-images
```

表示された全チャンネル・スレッド対応、メッセージ・添付件数、上限超過画像のプレビュー置換件数を確認します。その後だけ同じコマンドへ `--apply` を付けます。途中停止しても状態ファイルから再開します。

移植結果はアーカイブ内の `mirror-existing-<移植先ID>-<対象範囲ハッシュ>.json` に記録されます。完了後はBotのMessage Content Intentに依存せず、Webhook自身で全投稿の本文と添付を読み返して検証できます。

```powershell
node --env-file=.env.discord-destination scripts/discord-archive.mjs verify-existing `
  --archive D:\propeller-archive `
  --state D:\propeller-archive\mirror-existing-移植先ID-対象範囲ハッシュ.json
```

やり直す場合は、状態表に記録されたWebhook投稿だけを削除できます。これは既存チャンネル、既存スレッド、利用者が作ったフォーラム開始文を削除しません。必ずdry-runの件数を確認してから `--apply` を付けます。

空カテゴリからチャンネルを自動作成し、スレッド内容を親チャンネルへ展開する旧方式は `mirror` です。構造を保ちたい移植では `mirror-existing` を優先します。

## Botを一切入れない場合の限界

Discordのデータパッケージには申請者本人が送信したメッセージしか入りません。サーバーテンプレートは履歴をコピーしません。全参加者が各自のデータパッケージを提出し、画像・動画を別途回収すれば一部再構成できますが、脱退者・未提出者・返信関係・リアクション・期限切れ添付が欠けるため「丸ごと移植」の完了条件を満たしません。

利用者トークンをプログラムへ入れてチャンネルを巡回する方法はself-botに当たり、Discordが禁止しています。このリポジトリでは対応しません。

## 4. 開発メンバー向けの共有版を作る

検証済みアーカイブを入力にして、ブラウザで読める検索画面、チャンネル/スレッド別Markdown、正規化JSONを生成します。添付本体は複製せず、一次アーカイブの `media/` を相対参照します。

```powershell
npm run discord:share -- `
  --archive "D:\共有フォルダ\01_一次アーカイブ" `
  --out "D:\共有フォルダ"
```

共有フォルダは次の構造になります。

```text
00_はじめに.md
01_一次アーカイブ/          manifest.json、messages.jsonl、media/
02_閲覧用/index.html        検索、ページツリー、画像・動画・音声の表示
03_Wiki取込用/             チャンネル/スレッド別Markdown、正規化JSON
share-manifest.json         生成件数と入力アーカイブの対応
```

受け渡し前に、共有版から一次アーカイブの添付をすべて辿れることを再検証します。

```powershell
node scripts/build-discord-share.mjs `
  --archive "D:\共有フォルダ\01_一次アーカイブ" `
  --out "D:\共有フォルダ" `
  --verify-only
```

`ok: true`、メッセージ・添付・Markdownの件数を確認します。フォルダを部分的に切り出すと画像・動画の参照が壊れるため、ルートから一式で共有してください。

## 5. プロペラWikiの初期下書きを作る

この節は管理者向けの旧資料変換ツールです。標準Wikiの利用者に端末ごとの取込は不要です。アプリ標準の構造とログイン限定資料の配信は [標準プロペラWiki](built-in-propeller-wiki.md) を参照してください。
下書き仕様JSONは、工程ごとの `slug/title/category/summary/tags/claims` を持つ配列です。`claims` は `kind/title/body/sources`（根拠メッセージIDの配列）を持ちます。本文とIDを含むため、仕様ファイルを公開GitHubへ置かないでください。

一次アーカイブから、ペラ日記を主資料にした根拠付きWiki下書きを生成します。Discord原文にない配合・温度・判定値を補完せず、曖昧なものは「確認待ち」に残します。生成物はすべて下書きであり、自動公開しません。

```powershell
npm run wiki:propeller -- `
  --archive "D:\共有フォルダ\01_一次アーカイブ" `
  --specs "D:\共有フォルダ\非公開の下書き仕様.json" `
  --out "D:\共有フォルダ\04_アプリ投入用"
```

Meister's Batonを開き、「技術Wiki」→「Wiki下書きを取り込む」から `04_アプリ投入用/プロペラWiki下書き.json` を選びます。ページツリーから工程別記事を開き、各主張の「Discord原文」で引用、投稿日、Discordリンク、添付ファイル情報を照合します。照合済みの主張だけを確認し、記事単位で公開してください。

JSONには添付のファイル名、容量、SHA-256、一次アーカイブ内の相対パスが入ります。画像・動画の本体は `01_一次アーカイブ/media/` にあり、共有閲覧版で表示します。現在のアプリはローカルファイル本体をJSONへ埋め込まず、添付情報と原文への導線を保持します。
