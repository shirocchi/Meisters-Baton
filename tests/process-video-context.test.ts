import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  buildContext,
  createReader,
  writeContext,
  type SourceData,
} from '../scripts/process-video-context';
import type { TeamData } from '../src/domain/types';

const bytes = Buffer.from('fixture image');
const sha = createHash('sha256').update(bytes).digest('hex');
const input = (): SourceData => ({
  mode: 'offline',
  retrievedAt: '2026-09-13',
  archive: {
    format: 'baton-growi-archive',
    version: 1,
    origin: 'https://wiki2.meister.tech',
    root: '/ペラ',
    exportedAt: '2026-09-09',
    expectedPages: 2,
    pages: [
      {
        id: 'skin',
        title: '外皮',
        path: '/ペラ/外皮',
        body: '旧製法',
        revisionId: 'revision-1',
        createdAt: '2023-01-01',
        updatedAt: '2023-01-02',
        author: 'fixture',
        sha256: 'old-body-sha',
        commentCount: 0,
        attachments: [
          {
            id: 'image',
            name: 'image.png',
            bytes: bytes.length,
            contentType: 'image/png',
            url: '/attachment/image',
            downloadUrl: '/download/image',
            sha256: sha,
          },
        ],
      },
      {
        id: 'missing',
        title: '未取得',
        path: '/ペラ/未取得',
        body: '',
        revisionId: null,
        createdAt: '',
        updatedAt: '',
        author: '',
        sha256: '',
        commentCount: 0,
        unavailable: '404',
        attachments: [],
      },
    ],
  },
  edits: [
    {
      page_id: 'skin',
      title: '外皮の更新',
      body: '新しい積層の記録',
      version: 3,
      updated_at: '2026-09-12',
      author: 'editor',
      reason: '追記',
      events: [],
      media: [],
    },
  ],
});
const token = (role = 'authenticated') =>
  `header.${Buffer.from(
    JSON.stringify({
      role,
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url')}.signature`;
const team = (): TeamData => ({
  schemaVersion: 1,
  workspace: { id: 'team-1', name: 'fixture' },
  recordings: [],
  articles: [],
  requests: [],
  activity: [],
});
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('アプリWikiの制作コンテキスト', () => {
  it('アプリの編集本文を検索し、取込原文・版・欠落を保つ', () => {
    const data = input();
    const result = buildContext(data, '積層');
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].body).toBe('新しい積層の記録');
    expect(result.pages[0].source.importedBody).toBe('旧製法');
    expect(result.pages[0].source.edit).toMatchObject({ version: 3 });
    expect(result.coverage.missingPages).toEqual([{ id: 'missing', reason: '404' }]);
    expect(data.archive.pages[0].body).toBe('旧製法');
  });
  it('工房の作業記録Wikiを含め、デモを除外し、下書きと根拠を保つ', () => {
    const data = input();
    data.team = team();
    const article = {
      id: 'record-article',
      recordingId: 'r1',
      title: '積層の記録',
      category: '外皮',
      summary: '当日の観察',
      tags: [],
      claims: [],
      author: 'fixture',
      createdAt: '2026-09-12',
      updatedAt: '2026-09-12',
      status: 'draft' as const,
      isDemo: false,
      revisions: [],
      bookmarked: false,
    };
    data.team.articles = [article, { ...article, id: 'demo', isDemo: true }];
    const result = buildContext(data, '積層');
    expect(result.pages.map((p) => p.id)).toContain('record-article');
    expect(result.pages.map((p) => p.id)).not.toContain('demo');
    expect(result.pages.find((p) => p.id === article.id)?.source.status).toBe('draft');
    expect(result.warnings).toEqual([]);
  });
  it('編集未取得・0件・検索0件を区別する', () => {
    const data = input();
    delete data.edits;
    expect(buildContext(data, '外皮').warnings.join()).toContain('編集を未取得');
    data.edits = [];
    expect(buildContext(data, '外皮').warnings.join()).not.toContain('編集を未取得');
    expect(buildContext(data, '見つからない').coverage.selected).toBe(0);
  });
  it('アプリ編集で参照した別ページの添付と図鑑模型も解決する', () => {
    const data = input();
    const asset = data.archive.pages[0].attachments.pop()!;
    data.archive.pages[1].attachments.push(asset);
    data.edits![0].body += '\n![画像](/attachment/image)';
    const model = {
      ...asset,
      id: 'model',
      url: '/attachment/model',
      downloadUrl: '/download/model',
    };
    data.archive.pages[1].attachments.push(model);
    data.archive.atlas = {
      version: 1,
      modelAssetId: 'model',
      stages: [
        {
          id: 'skin',
          pageId: 'skin',
          number: '1',
          short: '外皮',
          model: 'blade',
          local: false,
          photoId: 'image',
          photoCaption: 'fixture',
          sources: [],
          related: [],
        },
      ],
    };
    const result = buildContext(data, '積層');
    expect(result.pages[0].assets.map((a) => a.id)).toEqual(['image', 'model']);
    expect(result.pages[0].assets[0].originalReference?.url).toBe('/attachment/image');
    expect(result.atlas?.modelAssetId).toBe('model');
  });
  it('添付照合の成功と不一致を保存し、既存出力を上書きしない', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'baton-context-'));
    roots.push(root);
    const out = path.join(root, '.data', 'good');
    const context = buildContext(input(), '外皮');
    const result = await writeContext(context, out, async () => bytes);
    expect(result.assets[0].status).toBe('verified');
    expect(await readFile(path.join(out, String(result.assets[0].file)))).toEqual(bytes);
    const saved = JSON.parse(await readFile(path.join(out, 'context.json'), 'utf8'));
    expect(saved.pages[0].source.importedBody).toBe('旧製法');
    await expect(writeContext(context, out)).rejects.toThrow();
    const bad = path.join(root, '.data', 'bad');
    const failed = await writeContext(context, bad, async () => Buffer.from('wrong'));
    expect(failed.assets[0].status).toBe('unavailable');
    expect(await readdir(path.join(bad, 'media'))).toEqual([]);
    await expect(writeContext(context, path.join(root, 'public'))).rejects.toThrow('.data');
  });
});

describe('認証済みSupabase読み取り', () => {
  const mockApi = (failure?: 'archive' | 'edits' | 'membership') =>
    vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      expect(String(url)).toMatch(/^https:\/\/fixture.supabase.co\//);
      expect(init?.method).toBe('GET');
      expect(init?.redirect).toBe('error');
      const u = new URL(String(url));
      if (u.pathname === '/auth/v1/user') return Response.json({ id: 'user-1' });
      if (u.pathname.includes('/storage/')) return new Response(bytes);
      if (u.searchParams.get('offset') !== '0') return Response.json([]);
      if (u.pathname.endsWith('team_members'))
        return Response.json(failure === 'membership' ? [] : [{ team_id: 'team-1' }]);
      if (u.pathname.endsWith('wiki_page_edits'))
        return failure === 'edits'
          ? new Response(null, { status: 403 })
          : Response.json(input().edits);
      if (u.pathname.endsWith('team_state')) return Response.json([{ data: team() }]);
      if (u.searchParams.get('slug')?.startsWith('eq.atlas-asset-'))
        return Response.json([{ content: { encoding: 'base64', data: bytes.toString('base64') } }]);
      return Response.json(failure === 'archive' ? [] : [{ content: input().archive }]);
    });
  it('本人・所属を確認し、短いページでも末尾まで読み、原サイトへ通信しない', async () => {
    const fetcher = mockApi();
    const jwt = token();
    const data = await createReader(
      'https://fixture.supabase.co',
      'sb_publishable_fixture',
      jwt,
      fetcher as typeof fetch,
    ).load('team-1');
    expect(buildContext(data, '積層').pages[0].body).toBe('新しい積層の記録');
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('offset=1'))).toBe(true);
    expect(
      fetcher.mock.calls.every(
        ([, options]) =>
          (options?.headers as Record<string, string>).Authorization === `Bearer ${jwt}`,
      ),
    ).toBe(true);
  });
  it.each(['archive', 'edits', 'membership'] as const)(
    '%s取得失敗では原文だけの成功にしない',
    async (failure) => {
      const reader = createReader(
        'https://fixture.supabase.co',
        'sb_publishable_fixture',
        token(),
        mockApi(failure) as typeof fetch,
      );
      await expect(reader.load('team-1')).rejects.toThrow();
    },
  );
  it('StorageとDB添付を読み、他工房・経路細工を拒否する', async () => {
    const reader = createReader(
      'https://fixture.supabase.co',
      'sb_publishable_fixture',
      token(),
      mockApi() as typeof fetch,
    );
    const asset = buildContext(input(), '外皮').pages[0].assets[0];
    expect(await reader.asset(asset, 'team-1')).toEqual(bytes);
    expect(await reader.asset({ ...asset, sourceSlug: `atlas-asset-${sha}` }, 'team-1')).toEqual(
      bytes,
    );
    for (const objectPath of ['other/media', 'team-1/../other', 'team-1/%2fother'])
      await expect(
        reader.asset({ ...asset, bucket: 'team-media', objectPath }, 'team-1'),
      ).rejects.toThrow();
  });
  it('service_role・期限切れ・HTTP接続を拒否し、失敗レスポンスをログへ漏らさない', async () => {
    expect(() =>
      createReader('https://fixture.supabase.co', 'key', token('service_role')),
    ).toThrow();
    expect(() =>
      createReader('https://fixture.supabase.co', 'sb_secret_fixture', token()),
    ).toThrow();
    expect(() => createReader('http://fixture.supabase.co', 'key', token())).toThrow();
    const expired = `h.${Buffer.from(JSON.stringify({ role: 'authenticated', sub: 'u', exp: 1 })).toString('base64url')}.s`;
    expect(() => createReader('https://fixture.supabase.co', 'key', expired)).toThrow();
    const reader = createReader(
      'https://fixture.supabase.co',
      'key',
      token(),
      vi.fn(async () => new Response('secret payload', { status: 401 })),
    );
    await expect(reader.load('team-1')).rejects.toThrow('HTTP 401');
  });
});
