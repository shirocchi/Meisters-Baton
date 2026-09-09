import { expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import type { WikiArchive, WikiPage } from '../../../src/domain/growiWiki';
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="50"><rect width="80" height="50" fill="blue"/></svg>';
const sha = createHash('sha256').update(svg).digest('hex');
const asset = {
  id: 'test-image',
  name: 'fixture.svg',
  bytes: Buffer.byteLength(svg),
  sha256: sha,
  contentType: 'image/svg+xml',
  url: '/attachment/test-image',
  downloadUrl: '/download/test-image',
};
const make = (id: string, path: string, body: string): WikiPage => ({
  id,
  path,
  title: path.split('/').at(-1)!,
  body,
  revisionId: 'test-revision',
  createdAt: '2026-01-01',
  updatedAt: '2026-09-09',
  author: '検証用の架空資料',
  sha256: 'a'.repeat(64),
  commentCount: 0,
  attachments: [],
});
export const fixture: WikiArchive = {
  format: 'baton-growi-archive',
  version: 1,
  origin: 'https://wiki2.meister.tech',
  root: '/ペラ',
  exportedAt: '2026-09-09',
  expectedPages: 2,
  pages: [
    make('root', '/ペラ', '# ペラ\n\n$lsx(/ペラ)'),
    {
      ...make(
        'skin',
        '/ペラ/外皮',
        '# 外皮積層\n\n前：[ペラ](/ペラ)\n\n## 真空引き\n\n非公開の検証本文4819\n\n![試験写真](/attachment/test-image)\n\n|材料|数量|\n|---|---|\n|検証材|1|\n\n<script>alert(1)</script>',
      ),
      attachments: [asset],
    },
  ],
  home: make(
    'home',
    '/統合マニュアル',
    '# カーボンモノコックマニュアル\n\n[外皮の原文](/ペラ/外皮)\n\n## 積層\n\nマニュアルと日記を工程で照合。',
  ),
};
export async function connect(page: Page, archive: WikiArchive = fixture) {
  const uid = '11111111-1111-4111-8111-111111111111';
  const part = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const token = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: uid, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture`;
  await page.addInitScript(
    ({ token, uid }) =>
      localStorage.setItem(
        'meisters-baton-supabase-auth',
        JSON.stringify({
          access_token: token,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: 'test-refresh',
          user: {
            id: uid,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'fixture@example.com',
            app_metadata: { provider: 'email' },
            user_metadata: {},
            identities: [],
            created_at: '2026-01-01',
          },
        }),
      ),
    { token, uid },
  );
  await page.route('https://wiki-test.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes('team_members'))
      return route.fulfill({
        json: {
          team_id: '22222222-2222-4222-8222-222222222222',
          display_name: '試験メンバー',
          role: 'owner',
        },
      });
    if (url.pathname.endsWith('/teams'))
      return route.fulfill({
        json: { id: '22222222-2222-4222-8222-222222222222', name: '試験工房' },
      });
    if (url.pathname.endsWith('/wiki_page_edits') || url.pathname.endsWith('/wiki_page_revisions'))
      return route.fulfill({ json: [] });
    if (url.pathname.endsWith('/propeller_wiki_sources')) {
      expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
      return route.fulfill({ json: [{ content: archive }] });
    }
    if (url.pathname.includes('/storage/'))
      return route.fulfill({ contentType: 'image/svg+xml', body: svg });
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
    return route.fulfill({ status: 404 });
  });
}
