# モバイル版を配布するまで

更新: 2026-09-07。iOS / Android の実アプリ用プロジェクトを同梱したベータ基盤です。標準のネイティブプロジェクト生成、権限・アイコン・ビルド経路の設定と、実機での検証は別の工程です。GitHub CIでAndroid debug APKとiOSシミュレーター用アプリのコンパイルが成功しました。実機試験、ストア用署名、申請は未実施です。[対象コミットと成果物](verification.md#githubでの実行結果と成果物)を記録しています。

## 同梱する構成

| 項目               | 設定                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| アプリID           | `jp.meisters.baton`。ストアでの取得・利用可能性は所有者が確認                                                |
| 表示名             | Meister's Baton                                                                                              |
| バージョン / build | `0.1.0` / `1`                                                                                                |
| Web                | React の本番出力を `dist` からアプリへ同梱                                                                   |
| Android            | Capacitor 8.5.1、min SDK 24、compile / target SDK 36、Build Tools 35.0.0、AGP 8.13.0、Gradle 8.14.3、Java 21 |
| iOS                | Capacitor 8.5.1、iOS 15以上、Swift Package Manager、UIScene対応                                              |
| 永続化             | 端末の IndexedDB に記録・動画を保存。共有は利用者が選ぶ別操作                                                |

Capacitor 8 の公式要件は Node.js 22以上、Xcode 26以上、Android Studio 2025.2.1以上です。SDK値と導入手順は[公式環境設定](https://capacitorjs.com/docs/getting-started/environment-setup)と[8.0更新ガイド](https://capacitorjs.com/docs/updating/8-0)、UISceneは[8.5更新ガイド](https://capacitorjs.com/docs/updating/8-5)を参照してください。

## ビルドを再現する

リポジトリ直下で実行します。`npm run mobile:sync` は完成した Web 出力をネイティブプロジェクトへコピーし、使用するプラグインを反映します。

```sh
npm ci
npm run assets:icons
npm run typecheck
npm test
npm run build
npm run mobile:preflight
npm run mobile:sync
```

Android Studio で `android` を開きます。コマンドで debug APK を作る場合は、SDK 36 と build-tools 35.0.0をインストールし、Java 21を指定してから実行します。Build Tools は [AGP 8.13.0公式互換表](https://developer.android.com/build/releases/agp-8-13-0-release-notes?hl=en)の既定値に合わせています。

```sh
cd android
./gradlew assembleDebug
```

Windows では `gradlew.bat assembleDebug` を使います。出力は `android/app/build/outputs/apk/debug/app-debug.apk`。debug署名は試験用であり、ストア提出用の署名ではありません。

macOS では `ios/App/App.xcodeproj` を Xcode 26以上で開き、`App` schemeを選びます。最初のビルド時に Swift Package Manager の依存解決が必要です。

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/DerivedData CODE_SIGNING_ALLOWED=NO build
```

この成果物はシミュレーター用です。iPhoneへ配布できるIPAや署名済みarchiveは作成しません。

## GitHub Actions

`Application checks` は push / pull request で型検査、ドメイン/APIテスト、Webビルド、設定の事前点検、Chromium E2E、本番オフライン試験、Dockerの起動と永続化試験を実行します。失敗時はブラウザー試験の成果物を7日間保持します。

`Native beta builds` は `main` への初回pushを含め、アプリ本体・ネイティブ設定・素材・ビルドスクリプト・依存関係・当該workflowが変更されたpushで、AndroidとiOSを両方ビルドします。文書だけの変更では起動しません。Actions 画面から `android` / `ios` / `both` を選んだ手動実行も可能です。Androidはdebug APK、iOSは署名なしのシミュレーターアプリZIPを14日間保持します。2026-09-07の初回ビルドは両方成功しました。実機で使えることの確認とストア提出用署名は別の工程です。どちらのworkflowもストアへ送信しません。

iOS CIは `macos-15` の Xcode 26.3 を明示しています。既定のXcodeが必要版より古いことがあるためです。ランナー更新で削除された場合は、[GitHub公式のインストール済みソフトウェア一覧](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md)を確認して `DEVELOPER_DIR` を更新します。

## 権限とデータの扱い

Androidはカメラ・マイクを宣言し、機能がない端末を除外しない設定です。iOSは日本語のカメラ・マイク・写真選択の用途説明を持ちます。権限宣言だけでは使用可能性を検証できません。許可・拒否・後から取り消しの各経路を実機で試してください。WebViewの動画形式、ファイル選択、音声入力の対応差も確認対象です。

Androidは `allowBackup=false` に加え、旧バックアップ規則と Android 12以降のクラウド/端末移行の除外規則を設定しています。[Android公式のバックアップ仕様](https://developer.android.com/identity/data/autobackup)に沿った宣言です。iOSはアプリの Library / Documents に除外フラグを要求します。ただし Apple はこのフラグを絶対的な排除保証とはしていません。実際のバックアップ/復元を試験し、OSの挙動に関する断定は避けます。[Apple公式の説明](https://developer.apple.com/documentation/Foundation/optimizing-your-app-s-data-for-icloud-backup)

端末の故障、アンインストール、OSによる保存領域整理でローカル記録を失う可能性があります。JSONバックアップには動画・フレーム画像が入りません。録画原本の保存、JSONの書き出し、必要に応じたチーム同期をそれぞれ確認します。

`PrivacyInfo.xcprivacy` を App target の Resources に登録しています。Filesystem のタイムスタンプ理由 `C617.1` と、任意のアカウント・チーム共有で扱う氏名、メール、ユーザーID、写真/動画、音声、その他ユーザーコンテンツを機能提供目的として記載し、追跡は宣言していません。最終配布機能、API運用、ログ保持、外部音声入力を照合し、Xcodeのprivacy reportとストアの回答を運営者が確定します。[Filesystem公式](https://capacitorjs.com/docs/apis/filesystem)、[Appleの収集データ種別](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype)

## 申請前の点検

`npm run mobile:preflight` はファイル構成・設定・画像サイズ・出力中の明白な秘密鍵形式を調べます。コンパイルや審査の代わりにはなりません。`npm run mobile:preflight -- --release` では次の運用入力も確認します。これらは点検用であり、API接続先や署名設定を自動変更するものではありません。

| 環境変数                   | 必要な値                                    |
| -------------------------- | ------------------------------------------- |
| `RELEASE_MODE`             | `local` または `team`                       |
| `RELEASE_API_URL`          | `team`のとき、実際に運用するHTTPS API       |
| `RELEASE_PRIVACY_URL`      | 運営者が確定した公開プライバシーポリシーURL |
| `RELEASE_SUPPORT_URL`      | 問い合わせ先の公開URL                       |
| `RELEASE_APPLE_TEAM_ID`    | 所有するApple Developer Team ID             |
| `RELEASE_ANDROID_KEYSTORE` | 管理されたAndroidリリース鍵ファイルのパス   |

鍵・パスワード・証明書はコミットしません。OpenAIキーはサーバーだけに設定します。チーム配布時はHTTPS API、正確なCORS許可origin (`capacitor://localhost` / Androidの`https://localhost`)、データ保持・削除・復元運用を確認してください。設定画面の接続先と点検用変数は別です。

申請前に残る実作業:

- iPhoneとAndroid実機で、撮影→質問→回答→下書き→全項目確認→公開→根拠の再生を通す。
- オフライン再起動、バックグラウンド移行、長い動画、権限拒否、保存領域不足、横画面、文字拡大を試す。
- JSON書き出し/共有と読み戻し、元動画がない端末、同ID競合、チーム同期競合を試す。
- 運用APIで認証、所属外データへのアクセス拒否、AI送信への同意、実際のモデル応答と根拠、アカウント削除を確認する。
- Androidはrelease鍵とapplicationIdを確定し、署名済みAABを作成する。iOSはTeam/Bundle IDを確定し、実機archiveの署名とValidate Appを行う。
- 運営者情報、サポート先、公開ポリシー、プライバシー回答、対象年齢、実画面スクリーンショット、レビュー用アカウント、ストア掲載文を確定する。

2026-09-06–07の事前制作であることを公開時にも保ちます。9月15日の開発祭当日に制作したとの誤認を招かないよう、[制作時期の記録](pre-event-disclosure.md)と提出説明を一致させてください。
