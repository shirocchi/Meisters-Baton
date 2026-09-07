# 第三者ソフトウェア・フォント・素材の帰属

確認: 2026-09-07 / 対象: 0.1.0-beta.1

この記録は、リポジトリのpackage.json、package-lock.json、インストールされた各パッケージのpackage.jsonとLICENSE/NOTICEを読み取ったものです。アプリ独自部分へ新しいライセンスを付与する文書ではありません。スキル本文や個人Vaultの内容はコピーしていません。

## 記録した資料

- [全npm依存の一覧](third-party-inventory.json): 378個の依存エントリー。任意のOS別依存を含み、実際の配布バイナリに全部入るという意味ではありません。
- [原文のライセンスと通知](third-party-notices.txt): この環境で取得できた188種類のLICENSE/NOTICE本文。内容が同じファイルはハッシュでまとめ、各配布元を併記しています。
- フォントとLucideの通知は、下記の読みやすい個別ファイルでも保存しています。

一覧のscopeはpackage.json上の区分です。現在のDocker構成はtsxを実行するため開発依存も含めます。そのため「開発用」と表示された依存が必ず配布物から外れるとは扱いません。

## 直接使う依存

| パッケージ                        | バージョン | 宣言ライセンス | 出典                                                         |
| --------------------------------- | ---------- | -------------- | ------------------------------------------------------------ |
| @capacitor/android                | 8.5.1      | MIT            | [配布元](https://github.com/ionic-team/capacitor)            |
| @capacitor/app                    | 8.1.1      | MIT            | [配布元](https://github.com/ionic-team/capacitor-plugins)    |
| @capacitor/core                   | 8.5.1      | MIT            | [配布元](https://github.com/ionic-team/capacitor)            |
| @capacitor/filesystem             | 8.1.3      | MIT            | [配布元](https://github.com/ionic-team/capacitor-filesystem) |
| @capacitor/haptics                | 8.0.2      | MIT            | [配布元](https://github.com/ionic-team/capacitor-haptics)    |
| @capacitor/ios                    | 8.5.1      | MIT            | [配布元](https://github.com/ionic-team/capacitor)            |
| @capacitor/share                  | 8.0.1      | MIT            | [配布元](https://github.com/ionic-team/capacitor-plugins)    |
| @fontsource-variable/manrope      | 5.3.0      | OFL-1.1        | [配布元](https://github.com/fontsource/font-files)           |
| @fontsource-variable/noto-sans-jp | 5.3.0      | OFL-1.1        | [配布元](https://github.com/fontsource/font-files)           |
| cors                              | 2.8.6      | MIT            | [配布元](https://github.com/expressjs/cors)                  |
| dotenv                            | 17.4.2     | BSD-2-Clause   | [配布元](https://github.com/motdotla/dotenv)                 |
| express                           | 5.2.1      | MIT            | [配布元](https://github.com/expressjs/express)               |
| idb                               | 8.0.3      | ISC            | [配布元](https://github.com/jakearchibald/idb)               |
| lucide-react                      | 1.41.0     | ISC            | [配布元](https://github.com/lucide-icons/lucide)             |
| multer                            | 2.3.0      | MIT            | [配布元](https://github.com/expressjs/multer)                |
| openai                            | 7.10.0     | Apache-2.0     | [配布元](https://github.com/openai/openai-node)              |
| react                             | 19.2.8     | MIT            | [配布元](https://github.com/react/react)                     |
| react-dom                         | 19.2.8     | MIT            | [配布元](https://github.com/react/react)                     |
| zod                               | 4.5.4      | MIT            | [配布元](https://github.com/colinhacks/zod)                  |

## 開発・検証の依存

| パッケージ           | バージョン | 宣言ライセンス | 出典                                                         |
| -------------------- | ---------- | -------------- | ------------------------------------------------------------ |
| @axe-core/playwright | 4.13.0     | MPL-2.0        | [配布元](https://github.com/dequelabs/axe-core-npm)          |
| @capacitor/cli       | 8.5.1      | MIT            | [配布元](https://github.com/ionic-team/capacitor)            |
| @playwright/test     | 1.63.0     | Apache-2.0     | [配布元](https://github.com/microsoft/playwright)            |
| @types/cors          | 2.8.19     | MIT            | [配布元](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| @types/express       | 5.0.6      | MIT            | [配布元](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| @types/multer        | 2.2.0      | MIT            | [配布元](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| @types/node          | 26.4.1     | MIT            | [配布元](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| @types/react         | 19.2.18    | MIT            | [配布元](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| @types/react-dom     | 19.2.7     | MIT            | [配布元](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| @types/supertest     | 7.2.1      | MIT            | [配布元](https://github.com/DefinitelyTyped/DefinitelyTyped) |
| @vitejs/plugin-react | 6.1.1      | MIT            | [配布元](https://github.com/vitejs/vite-plugin-react)        |
| fake-indexeddb       | 6.2.5      | Apache-2.0     | [配布元](https://github.com/dumbmatter/fakeIndexedDB)        |
| prettier             | 3.9.6      | MIT            | [配布元](https://github.com/prettier/prettier)               |
| sharp                | 0.35.4     | Apache-2.0     | [配布元](https://github.com/lovell/sharp)                    |
| supertest            | 7.2.2      | MIT            | [配布元](https://github.com/ladjs/supertest)                 |
| tsx                  | 4.23.13    | MIT            | [配布元](https://github.com/privatenumber/tsx)               |
| typescript           | 7.0.2      | Apache-2.0     | [配布元](https://github.com/microsoft/TypeScript)            |
| vite                 | 8.2.2      | MIT            | [配布元](https://github.com/vitejs/vite)                     |
| vitest               | 5.0.0      | MIT            | [配布元](https://github.com/vitest-dev/vitest)               |

## フォントとアイコン

| 素材                  | 実際の帰属表示                                                                                                               | 同梱した通知                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Manrope Variable      | Copyright 2019 The Manrope Project Authors (https://github.com/sharanda/manrope)                                             | [SIL OFL 1.1原文](licenses/Manrope-OFL-1.1.txt)          |
| Noto Sans JP Variable | Google Inc.（配布パッケージのLICENSE・metadataに記載）                                                                       | [SIL OFL 1.1原文](licenses/Noto-Sans-JP-OFL-1.1.txt)     |
| Lucide                | Copyright (c) 2026 Lucide Icons and Contributors。Feather由来の対象アイコンには Copyright (c) 2013-present Cole Bemis も記載 | [ISCとFeather由来のMIT通知](licenses/Lucide-LICENSE.txt) |

フォントはFontsource Variableの5.3.0をローカルに同梱し、外部フォントCDNから取得しません。実際に参照するのは@fontsource-variable/manropeと@fontsource-variable/noto-sans-jpです。旧来の非Variableパッケージ2件はこの一覧に含めていません。配布するWeb/ネイティブアプリにも、対応する著作権表示と通知を利用者が参照できる形で含めてください。

ブランドSVG、工程の模式図、架空のサンプル説明、試験用の生成WebMは、このプロジェクトのために作成したものです。実際の工房の映像や専門家の承認として表示しません。外部の実作業動画を追加する際は、提供者・利用許可・展示範囲を別途記録します。

## 推移依存と配布先の違い

完全なエントリー一覧と出典はJSONを参照してください。今回の宣言ライセンスの内訳は次の通りです。

| 宣言                                     | エントリー数 |
| ---------------------------------------- | -----------: |
| 0BSD                                     |            1 |
| Apache-2.0                               |           43 |
| Apache-2.0 AND LGPL-3.0-or-later         |            3 |
| Apache-2.0 AND LGPL-3.0-or-later AND MIT |            1 |
| BlueOak-1.0.0                            |           10 |
| BSD-2-Clause                             |            1 |
| BSD-3-Clause                             |            2 |
| ISC                                      |           20 |
| LGPL-3.0-or-later                        |           10 |
| MIT                                      |          269 |
| MPL-2.0                                  |           14 |
| OFL-1.1                                  |            2 |
| Unlicense                                |            2 |

busboyとstreamsearchはpackage-lockのlicense欄に宣言がなかったため、インストールされたLICENSEのMIT本文から記録しました。Lucideも単一のISC宣言だけでなく、同梱LICENSEのFeather由来MIT通知を残しています。

sharpとOS別libvips関連の推移依存にはLGPLを含む宣言があります。最終的なDockerイメージを配布する場合は、そのOSで実際に入るパッケージ・バイナリに対応した通知とソース情報を確認します。Windowsで未取得の任意依存、Node.jsとDebianの基盤、Android/Swiftの依存はこのnpm一覧だけでは網羅しません。ネイティブコンパイルとコンテナ作成後に、対象成果物の通知を追記する項目です。

## 参照した資料とサービス

[frontend-design skill](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)は指針として参照し、本文をアプリへコピーしていません。OpenAI Docs、Capacitor、Node.js Dockerの資料も参照リンクで記録しています。[skill-usage.md](skill-usage.md)を参照してください。

OpenAIのモデルAPIは外部サービスです。SDKのApache-2.0ライセンスと、APIサービスの契約・利用条件は別です。モデル自体や各スキルの提供者による推奨・認定を示すものではありません。

この通知を9月15日当日の既存要素の開示に添付し、当日追加した依存・素材も更新してください。[事前開発の開示](pre-event-disclosure.md)と[配布チェック](release-checklist.md)を合わせて確認します。
