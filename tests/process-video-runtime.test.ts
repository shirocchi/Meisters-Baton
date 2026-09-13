import { describe, expect, it, vi } from 'vitest';
import express, { type ErrorRequestHandler } from 'express';
import request from 'supertest';
import { processVideoHandler } from '../server/processVideo';
import {
  processVideoPlanIssue,
  processVideoPlanSchema,
  type ProcessVideoPlan,
} from '../src/domain/processVideo';
import { ApiError } from '../server/ai';

const teamId = '4aaa4b2a-2c31-4a1d-9cbe-29fd3bf25408';
const token = `header.${Buffer.from(JSON.stringify({ role: 'authenticated', sub: 'user-1', exp: Date.now() / 1000 + 600 })).toString('base64url')}.test-only`;
const fixture = {
  format: 'baton-growi-archive',
  version: 1,
  origin: 'https://wiki2.meister.tech',
  root: '/ペラ',
  exportedAt: '2026-09-13',
  expectedPages: 1,
  pages: [
    {
      id: 'fixture-page',
      title: '外皮',
      path: '/ペラ/外皮',
      body: 'テスト本文',
      revisionId: null,
      createdAt: '',
      updatedAt: '',
      author: 'fixture',
      sha256: '',
      commentCount: 0,
      attachments: [],
    },
  ],
};
function app(fetcher: typeof fetch, provider = vi.fn()) {
  const app = express();
  app.use(express.json());
  app.post(
    '/api/process-video',
    processVideoHandler({
      url: 'https://project.supabase.co',
      key: 'sb_publishable_test',
      fetcher,
      provider,
      skill: 'fixture instructions',
    }),
  );
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(error instanceof ApiError ? error.status : 500).json({ code: error.code });
  };
  app.use(errors);
  return app;
}
const payload = { action: 'check', query: '外皮', teamId };
const fetcher = vi.fn(async (url: string | URL | Request) => {
  const u = new URL(String(url));
  const body =
    u.pathname === '/auth/v1/user'
      ? { id: 'user-1' }
      : u.searchParams.get('offset') === '100'
        ? []
        : u.searchParams.get('offset') === '1'
          ? []
          : u.pathname.endsWith('team_members')
            ? [{ team_id: teamId }]
            : u.pathname.endsWith('propeller_wiki_sources')
              ? [{ content: fixture }]
              : [];
  return new Response(JSON.stringify(body));
}) as unknown as typeof fetch;
describe('production-JWT runtime boundary (mock auth server, not a live JWT test)', () => {
  it('does not access Supabase or model without bearer authentication', async () => {
    const network = vi.fn();
    const model = vi.fn();
    expect(
      (await request(app(network, model)).post('/api/process-video').send(payload)).status,
    ).toBe(401);
    expect(network).not.toHaveBeenCalled();
    expect(model).not.toHaveBeenCalled();
  });
  it('rejects forged JWTs when the real auth server rejects them', async () => {
    const model = vi.fn();
    const network = vi.fn(async () => new Response('{}', { status: 401 }));
    expect(
      (
        await request(app(network, model))
          .post('/api/process-video')
          .set('Authorization', `Bearer ${token}`)
          .send(payload)
      ).status,
    ).toBe(403);
    expect(model).not.toHaveBeenCalled();
  });
  it('checks membership and retrieves readable Wiki without making a model call', async () => {
    const model = vi.fn();
    const response = await request(app(fetcher, model))
      .post('/api/process-video')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      userId: 'user-1',
      importedPages: 1,
      matchedPages: 1,
      attachment: { status: 'unavailable' },
    });
    expect(model).not.toHaveBeenCalled();
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('rejects requests for another team before reading private sources', async () => {
    const network = vi.fn(
      async (url: string | URL | Request) =>
        new Response(JSON.stringify(String(url).includes('/auth/') ? { id: 'user-1' } : [])),
    );
    expect(
      (
        await request(app(network))
          .post('/api/process-video')
          .set('Authorization', `Bearer ${token}`)
          .send(payload)
      ).status,
    ).toBe(403);
    expect(network).toHaveBeenCalledTimes(2);
  });
});
describe('shared model continuity', () => {
  const pose = { modelId: 'a', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
  const plan = (): ProcessVideoPlan => ({
    title: '描画テスト',
    summary: 'テスト専用',
    missingEvidence: [],
    models: [
      {
        id: 'a',
        label: 'テスト用部材',
        shape: 'box',
        size: { x: 2, y: 1, z: 0.1 },
        color: 'teal',
        sourceIds: ['fixture-page'],
      },
    ],
    scenes: [
      {
        title: '配置',
        action: 'テスト用の移動',
        visual: '概念図',
        caption: 'テスト専用',
        uncertainty: '実製法ではない',
        sourceIds: ['fixture-page'],
        seconds: 4,
        start: [structuredClone(pose)],
        end: [structuredClone(pose)],
      },
    ],
  });
  it('accepts renderable geometry', () => {
    const value = plan();
    expect(processVideoPlanSchema.safeParse(value).success).toBe(true);
    expect(processVideoPlanIssue(value)).toBeUndefined();
  });
  it('rejects missing objects and teleportation between scenes', () => {
    const value = plan();
    value.scenes[0].end = [];
    expect(processVideoPlanIssue(value)).toBeTruthy();
    const other = plan();
    other.scenes.push(structuredClone(other.scenes[0]));
    other.scenes[1].start[0].position.x = 1;
    expect(processVideoPlanIssue(other)).toMatch(/不連続/);
  });
});
