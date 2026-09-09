import { afterEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reconcileTeamData, shareableData, validateApiBaseUrl } from '../src/pages/Settings';
import { createDemoData, createEmptyData, createManualAnalysis, draftArticle } from '../src/domain';
import type { AuthSession, Recording, TeamData } from '../src/domain/types';
import { createApp } from '../server/app';
import { api, assertAuthSession, setAuthSession } from '../src/lib/api';

const stamp = '2026-09-06T00:00:00.000Z';
const cleanups: (() => void)[] = [];
function realData(suffix = 'one'): TeamData {
  const data = createEmptyData('試験工房');
  const recording: Recording = {
    id: `recording_${suffix}`,
    title: '工程を確かめる',
    category: '引き継ぎ',
    author: '担当者',
    createdAt: stamp,
    updatedAt: stamp,
    duration: 60,
    frames: [],
    notes: '未確認の工程を記録する。',
    answers: [],
    status: 'draft',
    isDemo: false,
    mediaId: `media_${suffix}`,
  };
  recording.analysis = createManualAnalysis(recording, [10]);
  recording.answers = [
    {
      id: `answer_${suffix}`,
      questionId: recording.analysis.questions[0].id,
      text: '図面の番号を先に照合します。',
      author: '担当者',
      createdAt: stamp,
      source: 'text',
    },
  ];
  data.recordings.push(recording);
  data.articles.push(draftArticle(recording));
  return data;
}
afterEach(() => {
  setAuthSession(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe('settings merge contracts', () => {
  it('never sends demonstration material or its linked activity to a team', () => {
    const data = createDemoData();
    const real = realData();
    data.recordings.push(...real.recordings);
    data.articles.push(...real.articles);
    data.activity.push(
      {
        id: 'demo_activity',
        type: 'publish',
        title: 'サンプル公開',
        createdAt: stamp,
        targetId: data.articles[0].id,
      },
      {
        id: 'real_activity',
        type: 'record',
        title: '収録',
        createdAt: stamp,
        targetId: real.recordings[0].id,
      },
    );
    data.requests.push({
      id: 'demo_request',
      text: 'サンプルについて',
      category: 'デモ',
      createdAt: stamp,
      status: 'resolved',
      articleId: data.articles[0].id,
    });
    const outgoing = shareableData(data);
    expect(outgoing.recordings.map((r) => r.id)).toEqual(real.recordings.map((r) => r.id));
    expect(outgoing.articles.map((a) => a.id)).toEqual(real.articles.map((a) => a.id));
    expect(outgoing.activity.map((a) => a.id)).toEqual(['real_activity']);
    expect(outgoing.requests).toHaveLength(0);
    expect(data.recordings).toHaveLength(4);
  });

  it('keeps independent records from both devices without modifying either input', () => {
    const local = realData('local');
    const remote = realData('remote');
    const merged = reconcileTeamData(local, remote);
    expect(merged.recordings.map((r) => r.id)).toEqual(['recording_local', 'recording_remote']);
    expect(merged.articles).toHaveLength(2);
    expect(local.recordings).toHaveLength(1);
    expect(remote.recordings).toHaveLength(1);
  });

  it('accepts a remote-only edit while preserving the local video and bookmark', () => {
    const baseline = realData();
    const local = structuredClone(baseline);
    const remote = structuredClone(baseline);
    local.articles[0].bookmarked = true;
    remote.recordings[0].notes = '共有端末で追記した状況。';
    remote.recordings[0].mediaId = undefined;
    remote.recordings[0].remoteMediaId = 'shared-video';
    remote.articles[0].summary = '共有端末で整理した要約';
    const merged = reconcileTeamData(local, remote, baseline);
    expect(merged.recordings[0].notes).toBe(remote.recordings[0].notes);
    expect(merged.recordings[0].mediaId).toBe(local.recordings[0].mediaId);
    expect(merged.recordings[0].remoteMediaId).toBe('shared-video');
    expect(merged.articles[0].summary).toBe(remote.articles[0].summary);
    expect(merged.articles[0].bookmarked).toBe(true);
  });

  it('keeps an unsent local-only edit when the remote record is unchanged', () => {
    const baseline = realData();
    const local = structuredClone(baseline);
    const remote = structuredClone(baseline);
    local.recordings[0].title = '端末で編集した作業名';
    expect(reconcileTeamData(local, remote, baseline).recordings[0].title).toBe(
      local.recordings[0].title,
    );
  });

  it('stops divergent same-record edits and preserves both original values', () => {
    const baseline = realData();
    const local = structuredClone(baseline);
    const remote = structuredClone(baseline);
    local.recordings[0].notes = '手元での追記';
    remote.recordings[0].notes = '別の端末の追記';
    expect(() => reconcileTeamData(local, remote, baseline)).toThrow('上書きせず停止');
    expect(local.recordings[0].notes).toBe('手元での追記');
    expect(remote.recordings[0].notes).toBe('別の端末の追記');
  });

  it('does not guess which edit wins after a reload loses the comparison baseline', () => {
    const local = realData();
    const remote = structuredClone(local);
    remote.recordings[0].notes = 'あとから追加';
    expect(() => reconcileTeamData(local, remote)).toThrow('上書きせず停止');
  });

  it('applies a completed push to local state without reverting fetched changes on the next push', () => {
    const baseline = realData();
    const initial = structuredClone(baseline);
    const remote = structuredClone(baseline);
    remote.recordings[0].notes = '別の端末が先に更新';
    const outgoing = reconcileTeamData(initial, remote, baseline);
    const afterPush = reconcileTeamData(initial, outgoing, initial);
    expect(afterPush.recordings[0].notes).toBe(remote.recordings[0].notes);
    expect(reconcileTeamData(afterPush, outgoing, outgoing).recordings[0].notes).toBe(
      remote.recordings[0].notes,
    );
  });

  it('protects edits made during an upload and stops when they conflict with a fetched update', () => {
    const initial = realData();
    const current = structuredClone(initial);
    const response = structuredClone(initial);
    current.recordings[0].notes = 'アップロード中の編集';
    expect(reconcileTeamData(current, response, initial).recordings[0].notes).toBe(
      current.recordings[0].notes,
    );
    response.recordings[0].notes = '共有側で取得した変更';
    expect(() => reconcileTeamData(current, response, initial)).toThrow('上書きせず停止');
  });

  it('uses additive sync: local deletion never implicitly deletes a shared record', () => {
    const remote = realData();
    const local = createEmptyData('試験工房');
    expect(reconcileTeamData(local, remote, remote).recordings).toHaveLength(1);
    expect(reconcileTeamData(remote, local, remote).recordings).toHaveLength(1);
  });
});

describe('connection URL boundaries', () => {
  it('permits HTTPS origins and browser development loopback only', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    expect(validateApiBaseUrl(' https://example.com/ ')).toBe('https://example.com');
    expect(validateApiBaseUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787');
    expect(validateApiBaseUrl('http://localhost:8787')).toBe('http://localhost:8787');
    expect(validateApiBaseUrl('')).toBe('');
    for (const value of [
      'http://example.com',
      'javascript:alert(1)',
      'file:///tmp/a',
      'https://user:password@example.com',
      'https://example.com/api',
      'https://example.com?key=abc',
      'https://example.com/#fragment',
    ])
      expect(() => validateApiBaseUrl(value), value).toThrow();
  });

  it('allows no AI server and requires HTTPS when a native app configures one', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    expect(validateApiBaseUrl('')).toBe('');
    expect(() => validateApiBaseUrl('http://localhost:8787')).toThrow('HTTPS');
    expect(validateApiBaseUrl('https://baton.example.com')).toBe('https://baton.example.com');
  });
});

describe('Settings to server compatibility', () => {
  it('shares a real domain draft without samples and receives an optimistic conflict without changing saved data', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'baton-settings-test-'));
    const service = createApp({ dataDir, apiKey: '' });
    cleanups.push(() => {
      service.close();
      rmSync(dataDir, { recursive: true, force: true });
    });
    const registered = await request(service.app).post('/api/auth/register').send({
      email: 'settings@example.com',
      password: 'long-test-password',
      name: '担当者',
      teamName: '共有工房',
    });
    expect(registered.status).toBe(201);
    const authorization = `Bearer ${registered.body.token}`;
    const baseline = await request(service.app)
      .get('/api/sync')
      .set('Authorization', authorization);
    const local = createDemoData();
    const real = realData();
    local.recordings.push(...real.recordings);
    local.articles.push(...real.articles);
    const outgoing = reconcileTeamData(shareableData(local), baseline.body.data);
    outgoing.recordings = outgoing.recordings.map((record) => ({
      ...record,
      mediaId: undefined,
      frames: [],
    }));
    const saved = await request(service.app)
      .put('/api/sync')
      .set('Authorization', authorization)
      .send({ version: baseline.body.version, data: outgoing });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data.recordings).toHaveLength(1);
    expect(saved.body.data.articles[0].claims[0].review).toBe('draft');
    const stale = await request(service.app)
      .put('/api/sync')
      .set('Authorization', authorization)
      .send({ version: baseline.body.version, data: outgoing });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('SYNC_CONFLICT');
    expect(
      (await request(service.app).get('/api/sync').set('Authorization', authorization)).body,
    ).toEqual(saved.body);
  });
});

describe('connection changes during asynchronous operations', () => {
  const connection = (token = 'token-a', teamId = 'team-a'): AuthSession => ({
    token,
    user: {
      id: 'user-a',
      email: 'user@example.com',
      name: '担当者',
      teamId,
      teamName: '工房',
      role: 'owner',
    },
  });
  it('never sends a session token to a different configured server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    setAuthSession(connection(), 'https://server-a.example');
    await expect(api({ apiBaseUrl: 'https://server-b.example' }, '/api/sync')).rejects.toThrow(
      '異なります',
    );
    expect(fetchMock).not.toHaveBeenCalled();
    setAuthSession(connection('token-b'), 'https://server-b.example');
    await expect(
      api({ apiBaseUrl: 'https://server-a.example' }, '/api/media', {
        method: 'POST',
        sessionToken: 'token-a',
      }),
    ).rejects.toThrow('接続が変わった');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a completed old request after logout so its result cannot be applied', async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const settings = { apiBaseUrl: 'https://server-a.example' };
    setAuthSession(connection(), settings.apiBaseUrl);
    const pending = api(settings, '/api/sync', {
      sessionToken: 'token-a',
      sessionTeamId: 'team-a',
    });
    setAuthSession(null);
    resolveFetch(
      new Response(JSON.stringify({ privateData: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(pending).rejects.toThrow('接続が変わった');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('detects a team switch even when the server retains the same session token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const settings = { apiBaseUrl: 'https://server-a.example' };
    setAuthSession(connection(), settings.apiBaseUrl);
    setAuthSession(connection('token-a', 'team-b'), settings.apiBaseUrl);
    expect(() => assertAuthSession('token-a', settings, 'team-a')).toThrow('接続が変わった');
    await expect(
      api(settings, '/api/sync', {
        method: 'PUT',
        sessionToken: 'token-a',
        sessionTeamId: 'team-a',
      }),
    ).rejects.toThrow('接続が変わった');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
