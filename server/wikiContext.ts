import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { wikiArchiveSchema, wikiRoute, type WikiArchive } from '../src/domain/growiWiki';
import { protectedAssetSchema } from '../src/domain/wikiAtlas';
import { workshopMediaSchema } from '../src/domain/wikiWorkshop';
import { parseTeamData } from '../src/domain/validation';
import type { TeamData } from '../src/domain/types';

const editsSchema = z.array(
  z.object({
    page_id: z.string(),
    title: z.string(),
    body: z.string(),
    version: z.number().int(),
    updated_at: z.string(),
    author: z.string(),
    reason: z.string(),
    events: z.array(
      z.object({
        recordingId: z.string(),
        fingerprint: z.string(),
        heading: z.string(),
        integratedAt: z.string(),
      }),
    ),
    media: z.array(workshopMediaSchema),
  }),
);
export type Edits = z.infer<typeof editsSchema>;
export interface SourceData {
  userId?: string;
  archive: WikiArchive;
  edits?: Edits;
  team?: TeamData;
  teamId?: string;
  retrievedAt: string;
  mode: 'supabase' | 'offline';
}
interface Asset {
  id: string;
  name: string;
  bytes?: number;
  sha256?: string;
  contentType: string;
  bucket?: 'propeller-wiki-media' | 'team-media';
  objectPath?: string;
  sourceSlug?: string;
  originalReference?: { url: string; downloadUrl: string; fileName?: string };
  unavailable?: string;
}
export interface ContextPage {
  id: string;
  title: string;
  body: string;
  route: string;
  kind: 'imported-wiki' | 'app-article';
  source: Record<string, unknown>;
  assets: Asset[];
}
const digest = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const normalized = (s: string) => s.normalize('NFKC').toLocaleLowerCase();

export function buildContext(data: SourceData, query: string, limit = 12) {
  const { archive, edits, team } = data;
  const warnings: string[] = [];
  if (!edits) warnings.push('アプリ内の編集を未取得。取込時点の本文として扱う。');
  if (!team) warnings.push('アプリの作業記録Wikiを未取得。端末だけの未同期データも含まない。');
  const originals = [
    ...(archive.home ? [archive.home] : []),
    ...archive.pages,
    ...(archive.diary ?? []),
  ];
  const missingPages = originals
    .filter((p) => p.unavailable)
    .map((p) => ({ id: p.id, reason: p.unavailable }));
  const missingAssets = originals.flatMap((p) =>
    p.attachments
      .filter((a) => !a.sha256)
      .map((a) => ({ pageId: p.id, id: a.id, reason: a.error ?? '未取得' })),
  );
  const pages: ContextPage[] = originals.map((p) => {
    const edit = edits?.find((e) => e.page_id === p.id);
    const body = edit?.body ?? p.body;
    const stages =
      archive.atlas?.stages.filter((s) => s.pageId === p.id || s.sources.includes(p.id)) ?? [];
    const detail = archive.atlas?.details?.find((d) => d.pageId === p.id);
    const visualIds = new Set(
      [
        ...(stages.length || detail
          ? [archive.atlas?.modelAssetId, archive.atlas?.paintAssetId]
          : []),
        ...stages.flatMap((s) => [
          s.photoId,
          ...(s.sections ?? []).map((section) => section.photoId),
        ]),
        detail?.photoId,
        ...(detail?.sections ?? []).map((section) => section.photoId),
      ].filter(Boolean),
    );
    // The app resolves shared images/models across pages, including links added by an edit.
    const linkedAssets = originals
      .flatMap((page) => page.attachments)
      .filter(
        (a) =>
          visualIds.has(a.id) ||
          [a.url, a.downloadUrl, a.fileName ? `/uploads/${a.fileName}` : ''].some(
            (link) => !!link && body.includes(link),
          ),
      );
    const selectedAssets = [
      ...new Map([...p.attachments, ...linkedAssets].map((a) => [a.id, a])).values(),
    ];
    const assets: Asset[] = selectedAssets.map((a) => ({
      id: a.id,
      name: a.name,
      bytes: a.bytes,
      sha256: a.sha256,
      contentType: a.contentType,
      bucket: 'propeller-wiki-media',
      objectPath: a.sha256,
      sourceSlug: a.sourceSlug,
      originalReference: { url: a.url, downloadUrl: a.downloadUrl, fileName: a.fileName },
      unavailable: a.sha256 ? undefined : (a.error ?? '未取得'),
    }));
    for (const m of edit?.media ?? [])
      assets.push({
        id: m.id,
        name: m.name,
        bytes: m.bytes,
        contentType: m.type,
        bucket: 'team-media',
        objectPath: m.remotePath,
      });
    return {
      id: p.id,
      title: edit?.title ?? p.title,
      body: edit?.body ?? p.body,
      route: wikiRoute(p.id),
      kind: 'imported-wiki',
      assets,
      source: {
        path: p.path,
        origin: archive.origin,
        revisionId: p.revisionId,
        importedUpdatedAt: p.updatedAt,
        importedSha256: p.sha256,
        importedBody: p.body,
        exportedAt: archive.exportedAt,
        unavailable: p.unavailable,
        currentSha256: digest(edit?.body ?? p.body),
        edit: edit
          ? {
              version: edit.version,
              updatedAt: edit.updated_at,
              author: edit.author,
              reason: edit.reason,
              events: edit.events,
            }
          : null,
        atlasStages: archive.atlas?.stages.filter(
          (s) => s.pageId === p.id || s.sources.includes(p.id),
        ),
      },
    };
  });
  for (const article of team?.articles ?? []) {
    if (article.isDemo) continue;
    const recording = team?.recordings.find((r) => r.id === article.recordingId && !r.isDemo);
    const assets: Asset[] = article.claims.flatMap((c) =>
      c.evidence.flatMap((e) =>
        (e.sourceAttachments ?? []).map((a) => ({
          id: a.sha256,
          name: a.filename,
          bytes: a.bytes,
          sha256: a.sha256,
          contentType: a.contentType,
          bucket: 'propeller-wiki-media' as const,
          objectPath: a.sha256,
        })),
      ),
    );
    if (recording?.remoteMediaId)
      assets.push({
        id: recording.id,
        name: recording.fileName ?? recording.id,
        contentType: recording.mimeType ?? 'application/octet-stream',
        bucket: 'team-media',
        objectPath: recording.remoteMediaId,
      });
    pages.push({
      id: article.id,
      title: article.title,
      kind: 'app-article',
      route: `#article/${encodeURIComponent(article.id)}`,
      body: [
        article.summary,
        ...article.claims.map((c) => `## ${c.title}\n${c.body}`),
        recording?.notes ?? '',
      ].join('\n\n'),
      assets,
      source: {
        updatedAt: article.updatedAt,
        status: article.status,
        claims: article.claims,
        recording: recording
          ? {
              id: recording.id,
              createdAt: recording.createdAt,
              notes: recording.notes,
              answers: recording.answers,
              analysis: recording.analysis,
              mediaAvailable: !!recording.remoteMediaId,
            }
          : null,
      },
    });
  }
  const words = normalized(query).trim().split(/\s+/).filter(Boolean);
  if (!words.length) throw Error('検索語を --query で指定してください。');
  const matches = pages
    .map((page) => ({
      page,
      score: words.reduce(
        (sum, w) =>
          sum +
          (normalized(page.title).includes(w) ? 5 : 0) +
          (normalized(String(page.source.path ?? '')).includes(w) ? 2 : 0) +
          (normalized(page.body).includes(w) ? 1 : 0),
        0,
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return {
    format: 'baton-process-video-context',
    version: 1,
    mode: data.mode,
    retrievedAt: data.retrievedAt,
    teamId: data.teamId,
    query,
    atlas: archive.atlas,
    coverage: {
      importedExpectedPages: archive.expectedPages,
      importedPages: archive.pages.length,
      editPages: edits?.length ?? null,
      appArticles: team?.articles.filter((a) => !a.isDemo).length ?? null,
      matches: matches.length,
      selected: Math.min(limit, matches.length),
      missingPages,
      missingAssets,
    },
    warnings,
    pages: matches.slice(0, limit).map((x) => x.page),
  };
}

export function createReader(url: string, key: string, token: string, fetcher = fetch) {
  const base = new URL(url);
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== '/'
  )
    throw Error('SupabaseのHTTPSプロジェクトURLを指定してください。');
  let claims;
  try {
    claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  } catch {
    throw Error('アプリのユーザーアクセストークンが必要です。');
  }
  // This is only a misuse check. Supabase verifies the JWT and enforces RLS on every request.
  if (
    !key.trim() ||
    claims.role !== 'authenticated' ||
    !claims.sub ||
    !Number.isFinite(claims.exp) ||
    claims.exp * 1000 <= Date.now() ||
    key.startsWith('sb_secret_')
  )
    throw Error('有効なユーザーJWTとpublishable keyを使用してください。');
  try {
    if (JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'service_role')
      throw Error('service_roleキーは使用できません。');
  } catch (e) {
    if (e instanceof Error && e.message.includes('service_role')) throw e;
  }
  async function request(endpoint: string) {
    const target = new URL(endpoint, base);
    if (target.origin !== base.origin) throw Error('異なる配信元へ認証情報は送信しません。');
    let response;
    try {
      response = await fetcher(target, {
        method: 'GET',
        headers: { apikey: key, Authorization: `Bearer ${token}` },
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw Error('Supabaseへの接続に失敗しました。');
    }
    if (!response.ok)
      throw Error(
        `アプリ資料の取得失敗（HTTP ${response.status}）。認証・所属・資料閲覧権限を確認してください。`,
      );
    return response;
  }
  async function rows(endpoint: string) {
    const result: unknown[] = [];
    for (let offset = 0; ;) {
      const batch = z
        .array(z.unknown())
        .parse(await (await request(`/rest/v1/${endpoint}&limit=100&offset=${offset}`)).json());
      if (!batch.length) return result;
      result.push(...batch);
      offset += batch.length;
      if (offset > 100000) throw Error('資料件数が上限を超えました。対象を確認してください。');
    }
  }
  async function load(teamId: string): Promise<SourceData> {
    const user = z.object({ id: z.string() }).parse(await (await request('/auth/v1/user')).json());
    const members = await rows(
      `team_members?user_id=eq.${encodeURIComponent(user.id)}&team_id=eq.${encodeURIComponent(teamId)}&select=team_id`,
    );
    if (!members.length) throw Error('指定した工房のメンバーではありません。');
    const archiveRows = z
      .array(z.object({ content: wikiArchiveSchema }))
      .parse(await rows('propeller_wiki_sources?slug=eq.growi-archive-v1&select=content'));
    if (archiveRows.length !== 1)
      throw Error(
        '取込Wikiを取得できません。propeller_wiki_accessの許可または配置状態を確認してください。',
      );
    const edits = editsSchema.parse(
      await rows(`wiki_page_edits?team_id=eq.${encodeURIComponent(teamId)}&select=*&order=page_id`),
    );
    const states = z
      .array(z.object({ data: z.unknown() }))
      .parse(await rows(`team_state?team_id=eq.${encodeURIComponent(teamId)}&select=data`));
    return {
      archive: archiveRows[0].content,
      userId: user.id,
      edits,
      team: states.length ? parseTeamData(states[0].data) : undefined,
      teamId,
      retrievedAt: new Date().toISOString(),
      mode: 'supabase',
    };
  }
  async function asset(a: Asset, teamId: string) {
    if (a.sourceSlug) {
      if (!/^atlas-asset-[a-f0-9]{64}$/.test(a.sourceSlug)) throw Error('添付IDが不正です。');
      const data = z
        .array(z.object({ content: protectedAssetSchema }))
        .parse(await rows(`propeller_wiki_sources?slug=eq.${a.sourceSlug}&select=content`));
      if (data.length !== 1) throw Error('添付が未配置か閲覧できません。');
      return Buffer.from(data[0].content.data, 'base64');
    }
    const objectPath = a.objectPath ?? '';
    if (a.bucket === 'propeller-wiki-media') {
      if (!/^[a-f0-9]{64}$/.test(objectPath)) throw Error('添付ハッシュが不正です。');
    } else if (
      a.bucket !== 'team-media' ||
      !objectPath.startsWith(`${teamId}/`) ||
      objectPath.split('/').some((s) => !s || s === '.' || s === '..') ||
      /[\\%?#]/.test(objectPath)
    ) {
      throw Error('この添付は指定した工房に属していません。');
    }
    return Buffer.from(
      await (
        await request(
          `/storage/v1/object/authenticated/${a.bucket}/${objectPath.split('/').map(encodeURIComponent).join('/')}`,
        )
      ).arrayBuffer(),
    );
  }
  return { load, asset };
}

export async function loadOffline(
  archivePath: string,
  editsPath?: string,
  backupPath?: string,
): Promise<SourceData> {
  const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
  const archive = wikiArchiveSchema.parse(await json(archivePath));
  let team;
  if (backupPath) {
    const backup = z
      .object({
        format: z.literal('meisters-baton-backup'),
        version: z.literal(1),
        data: z.unknown(),
      })
      .parse(await json(backupPath));
    team = parseTeamData(backup.data);
  }
  return {
    archive,
    edits: editsPath ? editsSchema.parse(await json(editsPath)) : undefined,
    team,
    mode: 'offline',
    retrievedAt: new Date().toISOString(),
  };
}

export async function writeContext(
  context: ReturnType<typeof buildContext>,
  output: string,
  readAsset?: (asset: Asset) => Promise<Buffer>,
) {
  const folder = path.resolve(output);
  // Private exports must not be accidentally placed in tracked/public build directories.
  if (!folder.split(path.sep).includes('.data'))
    throw Error('保存先はGit対象外の .data/ 配下にしてください。');
  await mkdir(path.dirname(folder), { recursive: true });
  await mkdir(folder); // EEXIST: never overwrite another run.
  await mkdir(path.join(folder, 'pages'));
  await mkdir(path.join(folder, 'media'));
  const assets = [];
  const pageIndex = [];
  for (const [index, page] of context.pages.entries()) {
    const name = `${String(index + 1).padStart(3, '0')}-${digest(page.kind + page.id).slice(0, 12)}`;
    await writeFile(path.join(folder, 'pages', `${name}.md`), page.body, { flag: 'wx' });
    pageIndex.push({
      id: page.id,
      kind: page.kind,
      title: page.title,
      route: page.route,
      file: `pages/${name}.md`,
    });
    for (const a of page.assets) {
      const result: Record<string, unknown> = { pageId: page.id, ...a, status: 'not-requested' };
      if (a.unavailable) {
        result.status = 'unavailable';
      } else if (readAsset) {
        try {
          const bytes = await readAsset(a);
          const sha256 = digest(bytes);
          if (
            (a.sha256 && sha256 !== a.sha256) ||
            (a.bytes !== undefined && bytes.length !== a.bytes)
          )
            throw Error('添付のハッシュまたは容量が一致しません。');
          const ext =
            (
              {
                'image/png': '.png',
                'image/jpeg': '.jpg',
                'image/svg+xml': '.svg',
                'image/webp': '.webp',
                'image/gif': '.gif',
                'video/mp4': '.mp4',
                'application/pdf': '.pdf',
              } as Record<string, string>
            )[a.contentType] ?? '.bin';
          const file = `media/${sha256}${ext}`;
          try {
            await writeFile(path.join(folder, file), bytes, { flag: 'wx' });
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
          }
          result.status = a.sha256 ? 'verified' : 'downloaded-with-local-hash';
          result.file = file;
          result.actualSha256 = sha256;
          result.actualBytes = bytes.length;
        } catch {
          result.status = 'unavailable';
          result.error = '取得・整合性検証に失敗。未読として扱う。';
        }
      }
      assets.push(result);
    }
  }
  const manifest = { ...context, pageIndex, assets };
  await writeFile(path.join(folder, 'context.json'), JSON.stringify(manifest, null, 2), {
    flag: 'wx',
  });
  await writeFile(
    path.join(folder, 'README.md'),
    `# 製作動画の参照資料\n\n取得: ${context.retrievedAt}\n\n` +
      `本文の出典・編集版・欠落・添付対応は context.json を参照。取得は実見ではありません。\n\n` +
      context.warnings.map((w) => `- ${w}`).join('\n') +
      '\n\n' +
      pageIndex.map((p) => `- [${p.id.replace(/[\[\]\n]/g, '')}](${p.file})`).join('\n') +
      '\n',
    { flag: 'wx' },
  );
  return manifest;
}
