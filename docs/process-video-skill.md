# 製作3D解説スキルとアプリWiki参照

製作動画・短文と、アプリ内Wikiおよび取り込み済みMeister Wikiの本文・添付から無音3D解説を作る。元Wikiのログイン済みブラウザーは不要。

## 開発メンバーの導入

1. スキルを含む共有ブランチをclone／pullし、Meisters-BatonをCodexの作業フォルダーとして開く。
2. `.agents/skills/meister-process-video/SKILL.md` の存在を確認する。プロジェクト内の版を正本とし、個人用フォルダーへ重複コピーしない。
3. Node.jsと依存パッケージを用意する（`npm ci`）。
4. 本人のアプリアカウントで対象工房へ所属する。管理者は必要に応じて既存の `propeller_wiki_access` でその工房の資料閲覧を許可する。Supabase管理者アカウントや秘密キーの共有は不要。
5. 正規認証で得た本人のJWTを安全に実行プロセスへ渡し、`npm run wiki:context -- --help` に従って資料を取得する。権限のある保存済み資料を使うオフライン手順もある。
6. `$meister-process-video` を指定して動画とコメントを送る。

```text
$meister-process-video
添付動画と以下のコメントから無音3D解説を作ってください。
アプリ内Wikiの編集・作業記録と、取り込み済みMeister Wikiを参照してください。

[コメント]
撮影した工程や当日苦労した点を書く。
```

## 資料の取得

`scripts/export-process-video-context.ts` が、アプリと同じSupabaseから取込Wiki、工房の編集、作業記録Wikiを読み取り、検索に一致する本文・出典と必要な添付を新しい `.data/` フォルダーへ保存する。

| 資料                 | 保存先                                                         |
| -------------------- | -------------------------------------------------------------- |
| 取込Wikiと統合本文   | `propeller_wiki_sources` の `growi-archive-v1`                 |
| アプリ内の編集・追記 | 工房の `wiki_page_edits` をページIDで原文へ重ねる              |
| 作業記録Wiki・根拠   | `team_state.data.articles` / `recordings`                      |
| 取込添付・図鑑       | 非公開 `propeller-wiki-media` と添付の `sourceSlug` が指すDB行 |
| アプリの添付・映像   | 非公開 `team-media` の現在の工房配下                           |

実行プロセスにアプリと同じ `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`、本人の `BATON_ACCESS_TOKEN`、`BATON_TEAM_ID` を設定する。トークンを引数・チャット・Gitへ貼らない。CLIにログインUIはなく、呼び出し側がアプリの正規認証で得たJWTを渡す。読み取り時にSupabaseが認証・RLSを適用する。

```powershell
npm run wiki:context -- --query "外皮 積層" --out .data/process-videos/skin-01/references/wiki --media
```

本文Markdown、原文・編集版・出典・欠落・添付対応を持つ `context.json`、取得済みメディアが保存される。検索上限は既定12件で、対象工程の前後や用語を変えて追加検索する。`--media` がない場合、添付本体は取得しない。検索・取得・画像の実見は別々に確認する。

GitHubとアプリの資料閲覧権限は別。cloneだけでは非公開資料は揃わないが、元Wikiへ各自がログインし直す必要もない。401・403・0件ならアプリの認証・工房所属・資料許可・配置を確認する。

オフライン入力・添付検証・未同期データは [Wikiの参照方法](../.agents/skills/meister-process-video/references/wiki-access.md) を参照。アプリの通常バックアップだけでは取込Wiki全体や添付本体は揃わず、古い取込原文だけをアプリの最新本文と扱わない。

## 変更の範囲

これは開発用Codexのスキルと読み取り補助であり、アプリ内AIへの実行接続や動画生成APIの追加ではない。組み込みAIへの接続も、同じデータ構成と利用者の閲覧権限で取得した本文・添付を使う仕様とする。元サイトをComputer Useで読む依存関係は追加しない。

取り込みに欠落した資料は残る。Wiki全サイト・全改訂・全添付を完全インポートしたとは扱わず、追加インポートは不足を特定して別途行う。

動画制作・資料取得はDBの編集・公開を意味しない。元動画、本文・添付、生成コンテキストは `.data/` に保存し、Gitや公開ビルドには含めない。スキル・取得補助のコードだけを通常のPRで共有する。

## 動画検査のPython環境

既存環境があれば再利用できる。新規環境の例：

```powershell
python -m venv .data\process-video-tools
if ($LASTEXITCODE -ne 0) { throw 'Python環境を作成できませんでした' }
.\.data\process-video-tools\Scripts\python.exe -m pip install -r .\.agents\skills\meister-process-video\requirements.txt
if ($LASTEXITCODE -ne 0) { throw '依存パッケージを導入できませんでした' }
.\.data\process-video-tools\Scripts\python.exe .\.agents\skills\meister-process-video\scripts\inspect_video.py --help
```

PyAV・Pillowは動画検査用で、Wiki取得には不要。3Dレンダラー・完成動画生成コードはスキルに同梱されていない。制作方法に応じて既存環境を使う。
