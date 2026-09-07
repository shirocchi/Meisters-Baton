# 使ったスキルと一次資料

更新: 2026-09-07

スキルは設計・検証の進め方として利用した。外部スキルや文書を参照したことと、その提供者がアプリを推奨・認定したことを混同しない。

| 参照                                                                                                            | 今回の使い方                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [Anthropic公式 frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) | 工房という対象から色・文字・余白を決め、映像と判断を中心に据えるために参照。実装のデザイン基準は [design.md](design.md)。        |
| OpenAI Docs skill / [公式APIドキュメント](https://developers.openai.com/api/docs)                               | Astra、画像入力、構造化出力、データ保持を一次資料で確認し、未検証のAPI動作を実績として扱わない。                                 |
| [Capacitor公式ドキュメント](https://capacitorjs.com/docs)                                                       | iOS/Androidプロジェクト、バージョン要件、権限、Filesystemと配布経路を確認。詳細な出典は [mobile-release.md](mobile-release.md)。 |
| [Node.js公式Dockerガイド](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)                | 非rootの実行、プロセスへの終了シグナル、実行時環境設定をDocker構成へ反映。                                                       |

Supabase skillは候補調査の際に参照したが、今回の実装にはSupabaseを採用していない。端末のIndexedDBと独立したSQLite APIを使う。Sites用スキルも、今回はモバイルアプリの開発と判断し採用していない。

AI実装の主な参照先:

- [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)
- [画像入力と視覚](https://developers.openai.com/api/docs/guides/images-vision)
- [構造化出力](https://developers.openai.com/api/docs/guides/structured-outputs)
- [APIデータの管理](https://developers.openai.com/api/docs/guides/your-data)

開発祭の審査・事前開発・既存要素の開示条件は、[公式ルール](https://codex-student-hack-fes.openai.chatgpt.site/official-rules/)を確認した。制作期間と提出範囲は [pre-event-disclosure.md](pre-event-disclosure.md) に記録する。
