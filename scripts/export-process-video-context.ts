import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildContext, createReader, loadOffline, writeContext } from './process-video-context';

const { values } = parseArgs({
  options: {
    query: { type: 'string' },
    out: { type: 'string' },
    archive: { type: 'string' },
    edits: { type: 'string' },
    backup: { type: 'string' },
    'media-dir': { type: 'string' },
    media: { type: 'boolean' },
    limit: { type: 'string', default: '12' },
    help: { type: 'boolean' },
  },
});
if (values.help) {
  console.log(
    'npm run wiki:context -- --query "工程 部品" --out .data/process-videos/<run>/references/wiki [--media] [--limit 12]\n' +
      'オンライン: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, BATON_ACCESS_TOKEN, BATON_TEAM_ID をプロセス環境へ。\n' +
      'オフライン: --archive <package.json> [--edits <edits.json>] [--backup <アプリのバックアップ.json>] [--media-dir <growi/media>]',
  );
} else {
  try {
    if (!values.query || !values.out) throw Error('--query と --out が必要です。');
    const limit = Number(values.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
      throw Error('--limit は1〜1000です。');
    const env = process.env;
    if (!values.archive && (values.edits || values.backup || values['media-dir']))
      throw Error('--edits / --backup / --media-dir は --archive と一緒に使用してください。');
    const reader = values.archive
      ? undefined
      : createReader(
          env.VITE_SUPABASE_URL ?? '',
          env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
          env.BATON_ACCESS_TOKEN ?? '',
        );
    if (reader && !env.BATON_TEAM_ID) throw Error('BATON_TEAM_ID が必要です。');
    const data = values.archive
      ? await loadOffline(values.archive, values.edits, values.backup)
      : await reader!.load(env.BATON_TEAM_ID!);
    const context = buildContext(data, values.query, limit);
    const manifest = await writeContext(
      context,
      values.out,
      !values.media
        ? undefined
        : reader
          ? (a) => reader.asset(a, env.BATON_TEAM_ID!)
          : async (a) => {
              if (!values['media-dir'] || !a.sha256 || !/^[a-f0-9]{64}$/.test(a.sha256))
                throw Error('この添付のローカル実体がありません。');
              return readFile(path.join(values['media-dir'], a.sha256));
            },
    );
    console.log(
      `本文 ${manifest.pages.length}件、添付取得 ${manifest.assets.filter((a) => a.file).length}件。${path.resolve(values.out, 'README.md')}`,
    );
    if (
      !manifest.pages.length ||
      manifest.assets.some((a) => a.status === 'unavailable') ||
      manifest.warnings.length
    )
      console.log(
        '未取得・未確認があります。context.json の coverage / warnings / assets を確認してください。',
      );
  } catch (e) {
    // Schema failures may contain source text; never dump their payloads or credentials to logs.
    console.error(
      e instanceof Error && e.name !== 'ZodError' && !/Invalid URL/.test(e.message)
        ? e.message
        : '設定または入力データの形式が不正です。',
    );
    process.exitCode = 1;
  }
}
