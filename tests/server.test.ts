import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, type AppOptions } from '../server/app.js';
import type { AuthSession, Recording, TeamData, Article } from '../src/domain/types.js';
import type { ModelRequest } from '../server/ai.js';

const directories: string[] = [];
const servers: ReturnType<typeof createApp>[] = [];
const timestamp = '2026-09-06T00:00:00.000Z';
const password = 'strong-local-password';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jYf8AAAAASUVORK5CYII=',
  'base64',
);
function server(options: AppOptions = {}) {
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), 'baton-api-test-'));
  if (!directories.includes(dataDir)) directories.push(dataDir);
  const instance = createApp({ apiKey: '', dataDir, ...options });
  servers.push(instance);
  return instance;
}
async function register(
  instance: ReturnType<typeof createApp>,
  email = 'owner@example.com',
): Promise<AuthSession> {
  const response = await request(instance.app)
    .post('/api/auth/register')
    .send({ email, password, name: '田中', teamName: '工房' });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body;
}
const bearer = (session: AuthSession) => `Bearer ${session.token}`;
function recording(): Recording {
  return {
    id: 'rec-1',
    title: '面取り',
    category: '木工',
    author: '田中',
    createdAt: timestamp,
    updatedAt: timestamp,
    duration: 20,
    mediaId: 'local-video',
    frames: [],
    notes: '最初は端材で試す。',
    analysis: {
      mode: 'manual',
      summary: '面取りを観察する',
      segments: [
        { id: 'seg-1', start: 0, end: 20, title: '削る', observation: '鉋を手前に引いている。' },
      ],
      questions: [
        {
          id: 'q-1',
          segmentId: 'seg-1',
          text: '仕上がりをどう確認しますか？',
          reason: '合否の基準を確かめる',
          kind: 'judgment',
        },
      ],
      limitations: [],
    },
    answers: [
      {
        id: 'a-1',
        questionId: 'q-1',
        text: '指で触れて引っかかりがないことを確認する。',
        author: '田中',
        createdAt: timestamp,
        source: 'text',
      },
    ],
    status: 'draft',
    isDemo: false,
  };
}
function article(status: 'draft' | 'published' = 'published'): Article {
  return {
    id: 'article-1',
    recordingId: 'rec-1',
    title: '面取りの確認',
    summary: '引っかかりの確認',
    category: '木工',
    tags: ['面取り'],
    author: '田中',
    createdAt: timestamp,
    updatedAt: timestamp,
    status,
    isDemo: false,
    bookmarked: false,
    revisions: [],
    claims: [
      {
        id: 'claim-1',
        kind: 'judgment',
        title: '指で確認',
        body: '指で触れて引っかかりがないことを確認する。',
        review: status === 'published' ? 'confirmed' : 'draft',
        ...(status === 'published' ? { reviewedBy: '田中', reviewedAt: timestamp } : {}),
        evidence: [
          {
            id: 'ev-1',
            kind: 'answer',
            recordingId: 'rec-1',
            answerId: 'a-1',
            quote: '指で触れて引っかかりがないことを確認する。',
          },
        ],
      },
    ],
  };
}
function teamData(): TeamData {
  return {
    schemaVersion: 1,
    workspace: { id: 'local-team', name: '工房' },
    recordings: [recording()],
    articles: [article()],
    requests: [],
    activity: [],
  };
}
afterEach(() => {
  for (const instance of servers.splice(0)) {
    try {
      instance.close();
    } catch {
      /* Already closed in persistence test. */
    }
  }
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('authenticated, durable team API', () => {
  it('reports configuration honestly and requires auth for every AI route and sync', async () => {
    const instance = server();
    expect((await request(instance.app).get('/api/health')).body).toEqual({
      ok: true,
      aiConfigured: false,
      model: 'gpt-6-astra',
    });
    for (const route of ['/api/ai/analyze', '/api/ai/generate', '/api/ai/search'])
      expect((await request(instance.app).post(route).send({})).status).toBe(401);
    expect((await request(instance.app).get('/api/sync')).status).toBe(401);
    const session = await register(instance);
    const result = await request(instance.app)
      .post('/api/ai/analyze')
      .set('Authorization', bearer(session))
      .send({ recording: recording() });
    expect(result.status).toBe(503);
    expect(result.body.code).toBe('AI_NOT_CONFIGURED');
  });

  it('hashes passwords and tokens; sessions and team records survive a restart', async () => {
    const instance = server();
    const session = await register(instance, 'Owner@Example.COM');
    expect(session.user.email).toBe('owner@example.com');
    const row = instance.db.prepare('SELECT password_hash FROM users').get() as {
      password_hash: string;
    };
    expect(row.password_hash).toMatch(/^scrypt:/);
    expect(row.password_hash).not.toContain(password);
    expect(JSON.stringify(instance.db.prepare('SELECT * FROM sessions').all())).not.toContain(
      session.token,
    );
    const put = await request(instance.app)
      .put('/api/sync')
      .set('Authorization', bearer(session))
      .send({ version: 0, data: teamData() });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(put.body.data.workspace.id).toBe(session.user.teamId);
    instance.close();
    const reopened = server({ dataDir: directories[0] });
    expect(
      (await request(reopened.app).get('/api/sync').set('Authorization', bearer(session))).body
        .version,
    ).toBe(1);
    const login = await request(reopened.app)
      .post('/api/auth/login')
      .send({ email: 'owner@example.com', password });
    expect(login.status).toBe(200);
    expect(login.body.user.teamId).toBe(session.user.teamId);
    expect(
      (
        await request(reopened.app)
          .post('/api/auth/login')
          .send({ email: 'owner@example.com', password: 'incorrect-password' })
      ).status,
    ).toBe(401);
  });

  it('validates request bodies and rejects duplicate accounts', async () => {
    const instance = server();
    await register(instance);
    expect(
      (
        await request(instance.app)
          .post('/api/auth/register')
          .send({ email: 'bad', password: 'short', name: '', teamName: '' })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(instance.app)
          .post('/api/auth/register')
          .send({ email: 'owner@example.com', password, name: '別名', teamName: '工房' })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(instance.app)
          .post('/api/auth/login')
          .send({ email: 'owner@example.com', password, role: 'owner' })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(instance.app)
          .post('/api/auth/login')
          .set('Content-Type', 'application/json')
          .send('{broken')
      ).status,
    ).toBe(400);
  });

  it('revokes logout and expired tokens', async () => {
    let clock = 1_000_000;
    const instance = server({ now: () => clock, sessionAgeMs: 1000 });
    const session = await register(instance);
    expect(
      (await request(instance.app).get('/api/auth/me').set('Authorization', bearer(session)))
        .status,
    ).toBe(200);
    clock += 1001;
    expect(
      (await request(instance.app).get('/api/auth/me').set('Authorization', bearer(session)))
        .status,
    ).toBe(401);
    const second = await request(instance.app)
      .post('/api/auth/login')
      .send({ email: session.user.email, password });
    expect(
      (
        await request(instance.app)
          .post('/api/auth/logout')
          .set('Authorization', `Bearer ${second.body.token}`)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(instance.app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${second.body.token}`)
      ).status,
    ).toBe(401);
  });

  it('enforces an explicit CORS allowlist', async () => {
    const instance = server();
    const allowed = await request(instance.app)
      .get('/api/health')
      .set('Origin', 'capacitor://localhost');
    expect(allowed.status).toBe(200);
    expect(allowed.headers['access-control-allow-origin']).toBe('capacitor://localhost');
    expect(
      (await request(instance.app).get('/api/health').set('Origin', 'https://untrusted.example'))
        .status,
    ).toBe(403);
    expect(
      (
        await request(instance.app)
          .options('/api/sync')
          .set('Origin', 'http://localhost:5173')
          .set('Access-Control-Request-Method', 'PUT')
      ).status,
    ).toBe(204);
  });

  it('keeps the static offline shell independent of Origin while API responses remain private', async () => {
    const fixture = mkdtempSync(join(tmpdir(), 'baton-static-test-'));
    directories.push(fixture);
    const serveDir = join(fixture, 'public');
    mkdirSync(join(serveDir, 'assets'), { recursive: true });
    writeFileSync(
      join(serveDir, 'index.html'),
      '<!doctype html><main>Offline application shell</main>',
    );
    writeFileSync(join(serveDir, 'assets', 'app.js'), 'globalThis.batonReady=true;');
    const instance = server({ dataDir: join(fixture, 'data'), serveDir });
    for (const origin of [undefined, 'http://127.0.0.1:8787']) {
      const assetRequest = request(instance.app).get('/assets/app.js');
      if (origin) assetRequest.set('Origin', origin);
      const asset = await assetRequest;
      expect(asset.status).toBe(200);
      expect(asset.headers.vary).toBeUndefined();
      expect(asset.text).toContain('batonReady');
    }
    const health = await request(instance.app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    expect(health.status).toBe(200);
    expect(health.headers.vary).toContain('Origin');
    expect(health.headers['cache-control']).toBe('no-store');
    expect((await request(instance.app).get('/api/sync')).status).toBe(401);
  });

  it('shares data only after a valid invite and prevents member invite rotation', async () => {
    const instance = server();
    const owner = await register(instance);
    const member = await register(instance, 'member@example.com');
    await request(instance.app)
      .put('/api/sync')
      .set('Authorization', bearer(owner))
      .send({ version: 0, data: teamData() });
    expect(
      (await request(instance.app).get('/api/sync').set('Authorization', bearer(member))).body.data
        .recordings,
    ).toHaveLength(0);
    const invite = await request(instance.app)
      .post('/api/team/invite')
      .set('Authorization', bearer(owner));
    expect(invite.body.code).toMatch(/^[A-F0-9]{20}$/);
    expect(
      (await request(instance.app).get('/api/team/invite').set('Authorization', bearer(owner))).body
        .code,
    ).toBeNull();
    expect(
      JSON.stringify(instance.db.prepare('SELECT invite_hash FROM teams').all()),
    ).not.toContain(invite.body.code);
    const joined = await request(instance.app)
      .post('/api/team/join')
      .set('Authorization', bearer(member))
      .send({ code: invite.body.code });
    expect(joined.status).toBe(200);
    expect(joined.body.role).toBe('member');
    expect(joined.body.teamId).toBe(owner.user.teamId);
    expect(
      (await request(instance.app).get('/api/sync').set('Authorization', bearer(member))).body.data
        .recordings,
    ).toHaveLength(1);
    expect(
      (await request(instance.app).post('/api/team/invite').set('Authorization', bearer(member)))
        .status,
    ).toBe(403);
  });

  it('expires invites and protects a nonempty team from replacement', async () => {
    let clock = Date.now();
    const instance = server({ now: () => clock });
    const owner = await register(instance);
    const other = await register(instance, 'other@example.com');
    const invite = await request(instance.app)
      .post('/api/team/invite')
      .set('Authorization', bearer(owner));
    await request(instance.app)
      .put('/api/sync')
      .set('Authorization', bearer(other))
      .send({ version: 0, data: teamData() });
    expect(
      (
        await request(instance.app)
          .post('/api/team/join')
          .set('Authorization', bearer(other))
          .send({ code: invite.body.code })
      ).status,
    ).toBe(409);
    clock += 8 * 24 * 60 * 60 * 1000;
    const expired = await request(instance.app)
      .post('/api/team/join')
      .set('Authorization', bearer(other))
      .send({ code: invite.body.code });
    expect(expired.status).toBe(404);
  });

  it('rejects concurrent stale sync without overwriting newer data', async () => {
    const instance = server();
    const owner = await register(instance);
    const data = teamData();
    expect(
      (
        await request(instance.app)
          .put('/api/sync')
          .set('Authorization', bearer(owner))
          .send({ version: 0, data })
      ).status,
    ).toBe(200);
    data.recordings[0].title = '古い端末の編集';
    const stale = await request(instance.app)
      .put('/api/sync')
      .set('Authorization', bearer(owner))
      .send({ version: 0, data });
    expect(stale.status).toBe(409);
    expect(stale.body.currentVersion).toBe(1);
    expect(
      (await request(instance.app).get('/api/sync').set('Authorization', bearer(owner))).body.data
        .recordings[0].title,
    ).toBe('面取り');
  });

  it('rejects forged evidence, invalid times, demo data and unreviewed publication', async () => {
    const instance = server();
    const owner = await register(instance);
    const inputs: TeamData[] = [];
    const forged = teamData();
    forged.articles[0].claims[0].evidence[0].quote = '存在しない引用';
    inputs.push(forged);
    const outside = teamData();
    outside.recordings[0].analysis!.segments[0].end = 21;
    inputs.push(outside);
    const demo = teamData();
    demo.recordings[0].isDemo = true;
    inputs.push(demo);
    const unreviewed = teamData();
    unreviewed.articles[0].claims[0].review = 'draft';
    inputs.push(unreviewed);
    const duplicate = teamData();
    duplicate.recordings.push(recording());
    inputs.push(duplicate);
    const brokenReference = teamData();
    brokenReference.articles[0].recordingId = 'missing';
    inputs.push(brokenReference);
    const falseObservation = teamData();
    falseObservation.articles[0].claims[0].evidence = [
      {
        id: 'ev-video',
        kind: 'video',
        recordingId: 'rec-1',
        time: 3,
        quote: '鉋を手前に引いている。',
      },
    ];
    inputs.push(falseObservation);
    for (const data of inputs)
      expect(
        (
          await request(instance.app)
            .put('/api/sync')
            .set('Authorization', bearer(owner))
            .send({ version: 0, data })
        ).status,
      ).toBe(400);
    expect(
      (await request(instance.app).get('/api/sync').set('Authorization', bearer(owner))).body
        .version,
    ).toBe(0);
  });

  it('requires a password to delete an account and removes its sole team', async () => {
    const instance = server();
    const owner = await register(instance);
    expect(
      (
        await request(instance.app)
          .delete('/api/auth/account')
          .set('Authorization', bearer(owner))
          .send({ password: 'incorrect' })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(instance.app)
          .delete('/api/auth/account')
          .set('Authorization', bearer(owner))
          .send({ password })
      ).status,
    ).toBe(200);
    expect(
      (await request(instance.app).get('/api/auth/me').set('Authorization', bearer(owner))).status,
    ).toBe(401);
    expect(instance.db.prepare('SELECT * FROM teams').all()).toHaveLength(0);
  });

  it('preserves shared records and transfers ownership when an owner deletes their account', async () => {
    const instance = server();
    const owner = await register(instance);
    const member = await register(instance, 'member@example.com');
    const invite = await request(instance.app)
      .post('/api/team/invite')
      .set('Authorization', bearer(owner));
    await request(instance.app)
      .post('/api/team/join')
      .set('Authorization', bearer(member))
      .send({ code: invite.body.code });
    await request(instance.app)
      .put('/api/sync')
      .set('Authorization', bearer(owner))
      .send({ version: 0, data: teamData() });
    expect(
      (
        await request(instance.app)
          .delete('/api/auth/account')
          .set('Authorization', bearer(owner))
          .send({ password })
      ).status,
    ).toBe(200);
    expect(
      (await request(instance.app).get('/api/auth/me').set('Authorization', bearer(member))).body
        .role,
    ).toBe('owner');
    expect(
      (await request(instance.app).get('/api/sync').set('Authorization', bearer(member))).body.data
        .articles,
    ).toHaveLength(1);
  });
});

describe('private media', () => {
  it('serves media from a hidden data directory before and after restarting', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'baton-hidden-media-'));
    directories.push(parent);
    const dataDir = join(parent, '.data');
    const instance = server({ dataDir });
    const owner = await register(instance);
    const uploaded = await request(instance.app)
      .post('/api/media')
      .set('Authorization', bearer(owner))
      .attach('file', png, { filename: 'test.png', contentType: 'image/png' });
    expect(uploaded.status).toBe(201);
    const path = `/api/media/${uploaded.body.id}`;
    const before = await request(instance.app).get(path).set('Authorization', bearer(owner));
    expect(before.status).toBe(200);
    expect(before.body).toEqual(png);
    instance.close();
    const reopened = server({ dataDir });
    const after = await request(reopened.app).get(path).set('Authorization', bearer(owner));
    expect(after.status).toBe(200);
    expect(after.body).toEqual(png);
    expect((await request(reopened.app).get(path)).status).toBe(401);
    const stranger = await register(reopened, 'hidden-stranger@example.com');
    expect(
      (await request(reopened.app).get(path).set('Authorization', bearer(stranger))).status,
    ).toBe(404);
    const partial = await request(reopened.app)
      .get(path)
      .set('Authorization', bearer(owner))
      .set('Range', 'bytes=0-7');
    expect(partial.status).toBe(206);
    expect(partial.body).toEqual(png.subarray(0, 8));
  });

  it('checks file signatures, supports team-only download and cleans unused media', async () => {
    const instance = server();
    const owner = await register(instance);
    const stranger = await register(instance, 'other@example.com');
    expect(
      (
        await request(instance.app)
          .post('/api/media')
          .attach('file', png, { filename: 'image.png', contentType: 'image/png' })
      ).status,
    ).toBe(401);
    const upload = await request(instance.app)
      .post('/api/media')
      .set('Authorization', bearer(owner))
      .attach('file', png, { filename: 'image.png', contentType: 'image/png' });
    expect(upload.status, JSON.stringify(upload.body)).toBe(201);
    const path = `/api/media/${upload.body.id}`;
    expect(
      (await request(instance.app).get(path).set('Authorization', bearer(stranger))).status,
    ).toBe(404);
    const download = await request(instance.app).get(path).set('Authorization', bearer(owner));
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toMatch(/image\/png/);
    expect(download.body).toEqual(png);
    expect(
      (
        await request(instance.app)
          .post('/api/media')
          .set('Authorization', bearer(owner))
          .attach('file', Buffer.from('<svg onload="alert(1)">'), {
            filename: 'fake.png',
            contentType: 'image/png',
          })
      ).status,
    ).toBe(415);
    expect(
      (
        await request(instance.app)
          .post('/api/media')
          .set('Authorization', bearer(owner))
          .attach('file', Buffer.from('<svg/>'), {
            filename: 'unsafe.svg',
            contentType: 'image/svg+xml',
          })
      ).status,
    ).toBe(415);
    expect(readdirSync(join(directories[0], 'media'))).toHaveLength(1);
    expect(
      (await request(instance.app).delete(path).set('Authorization', bearer(owner))).status,
    ).toBe(200);
    expect(readdirSync(join(directories[0], 'media'))).toHaveLength(0);
  });

  it('rejects oversized files and cross-team media references during sync', async () => {
    const instance = server({ maxUploadBytes: 100 });
    const owner = await register(instance);
    const stranger = await register(instance, 'other@example.com');
    expect(
      (
        await request(instance.app)
          .post('/api/media')
          .set('Authorization', bearer(owner))
          .attach('file', Buffer.concat([png, Buffer.alloc(100)]), {
            filename: 'image.png',
            contentType: 'image/png',
          })
      ).status,
    ).toBe(413);
    const upload = await request(instance.app)
      .post('/api/media')
      .set('Authorization', bearer(owner))
      .attach('file', png, { filename: 'image.png', contentType: 'image/png' });
    const data = teamData();
    data.recordings[0].remoteMediaId = upload.body.id;
    expect(
      (
        await request(instance.app)
          .put('/api/sync')
          .set('Authorization', bearer(stranger))
          .send({ version: 0, data })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(instance.app)
          .put('/api/sync')
          .set('Authorization', bearer(owner))
          .send({ version: 0, data })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(instance.app)
          .delete(`/api/media/${upload.body.id}`)
          .set('Authorization', bearer(owner))
      ).status,
    ).toBe(409);
  });
});

describe('AI boundary using an injected provider (no live API calls)', () => {
  it('supplies timestamped sample frames and labels the observation limits', async () => {
    const source = recording();
    source.frames = [
      { id: 'frame-1', time: 3, dataUrl: `data:image/png;base64,${png.toString('base64')}` },
    ];
    const provider = vi.fn(async (_request: ModelRequest) => ({
      summary: '作業を観察',
      segments: source.analysis!.segments,
      questions: source.analysis!.questions,
      limitations: [],
    }));
    const instance = server({ aiProvider: provider });
    const owner = await register(instance);
    const result = await request(instance.app)
      .post('/api/ai/analyze')
      .set('Authorization', bearer(owner))
      .send({ recording: source, context: [] });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.mode).toBe('ai');
    expect(result.body.limitations[0]).toContain('動画全体や音声は解析していません');
    expect(provider.mock.calls[0][0].frames![0].time).toBe(3);
    expect(provider.mock.calls[0][0].schema).toHaveProperty('additionalProperties', false);
  });

  it('rejects hallucinated timestamps and arbitrary remote image URLs', async () => {
    const provider = vi.fn(async () => ({
      summary: '観察',
      segments: [{ ...recording().analysis!.segments[0], end: 9999 }],
      questions: recording().analysis!.questions,
      limitations: [],
    }));
    const instance = server({ aiProvider: provider });
    const owner = await register(instance);
    const invalidOutput = await request(instance.app)
      .post('/api/ai/analyze')
      .set('Authorization', bearer(owner))
      .send({ recording: recording() });
    expect(invalidOutput.status).toBe(502);
    expect(invalidOutput.body.code).toBe('AI_INVALID_OUTPUT');
    const source = recording();
    source.frames = [{ id: 'f-1', time: 1, dataUrl: 'http://169.254.169.254/latest/meta-data/' }];
    expect(
      (
        await request(instance.app)
          .post('/api/ai/analyze')
          .set('Authorization', bearer(owner))
          .send({ recording: source })
      ).status,
    ).toBe(400);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('creates drafts only and validates verbatim evidence', async () => {
    const output = {
      title: '面取り',
      summary: '指で確認',
      tags: ['木工'],
      claims: [
        {
          id: 'claim-1',
          kind: 'judgment',
          title: '指で確認',
          body: '引っかかりを確認する。',
          evidence: [
            {
              id: 'ev-1',
              kind: 'answer',
              recordingId: 'rec-1',
              answerId: 'a-1',
              time: null,
              quote: '指で触れて引っかかりがないことを確認する。',
            },
          ],
        },
      ],
    };
    const provider = vi.fn(async () => output);
    const instance = server({ aiProvider: provider });
    const owner = await register(instance);
    const valid = await request(instance.app)
      .post('/api/ai/generate')
      .set('Authorization', bearer(owner))
      .send({ recording: recording() });
    expect(valid.status, JSON.stringify(valid.body)).toBe(200);
    expect(valid.body.claims[0].review).toBe('draft');
    expect(valid.body.claims[0].reviewedBy).toBeUndefined();
    output.claims[0].evidence[0].quote = '手袋を着ければ絶対安全';
    const invalid = await request(instance.app)
      .post('/api/ai/generate')
      .set('Authorization', bearer(owner))
      .send({ recording: recording() });
    expect(invalid.status).toBe(502);
    expect(invalid.body.code).toBe('AI_INVALID_OUTPUT');
  });

  it('answers only from the authenticated team’s published confirmed claims', async () => {
    const provider = vi.fn(async (_request: ModelRequest) => ({
      answer: '指で引っかかりを確認します。',
      citations: [
        { articleId: 'article-1', claimId: 'claim-1', quote: '指で触れて引っかかりがない' },
      ],
      insufficient: false,
    }));
    const instance = server({ aiProvider: provider });
    const owner = await register(instance);
    const stranger = await register(instance, 'stranger@example.com');
    const data = teamData();
    const draft = article('draft');
    draft.id = 'secret-draft';
    draft.title = '未公開の秘密';
    data.articles.push(draft);
    expect(
      (
        await request(instance.app)
          .put('/api/sync')
          .set('Authorization', bearer(owner))
          .send({ version: 0, data })
      ).status,
    ).toBe(200);
    const answer = await request(instance.app)
      .post('/api/ai/search')
      .set('Authorization', bearer(owner))
      .send({ query: '面取りの確認方法は？' });
    expect(answer.status).toBe(200);
    expect(answer.body.insufficient).toBe(false);
    expect(provider.mock.calls[0][0].text).not.toContain('未公開の秘密');
    const empty = await request(instance.app)
      .post('/api/ai/search')
      .set('Authorization', bearer(stranger))
      .send({ query: '面取り' });
    expect(empty.status).toBe(200);
    expect(empty.body.insufficient).toBe(true);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('refuses fabricated search citations and enforces per-user AI limits', async () => {
    const provider = vi.fn(async () => ({
      answer: '正しい答えです',
      citations: [{ articleId: 'outside-team', claimId: 'claim-1', quote: '何か' }],
      insufficient: false,
    }));
    const instance = server({ aiProvider: provider, aiRequestsPerHour: 1 });
    const owner = await register(instance);
    await request(instance.app)
      .put('/api/sync')
      .set('Authorization', bearer(owner))
      .send({ version: 0, data: teamData() });
    const answer = await request(instance.app)
      .post('/api/ai/search')
      .set('Authorization', bearer(owner))
      .send({ query: '面取り' });
    expect(answer.status).toBe(502);
    expect(answer.body.code).toBe('AI_INVALID_OUTPUT');
    expect(
      (
        await request(instance.app)
          .post('/api/ai/search')
          .set('Authorization', bearer(owner))
          .send({ query: '面取り' })
      ).status,
    ).toBe(429);
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
