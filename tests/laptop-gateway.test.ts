import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createLaptopGateway } from '../server/laptopGateway';
import { interviewFixture } from './helpers/interviewFixture';
const teamId = '4aaa4b2a-2c31-4a1d-9cbe-29fd3bf25408';
const setup = () => {
  const provider = vi.fn(),
    fetcher = vi.fn();
  return {
    provider,
    fetcher,
    app: createLaptopGateway({
      url: 'https://project.supabase.co',
      key: 'sb_publishable_test',
      teamId,
      provider,
      fetcher,
      allowedOrigins: ['https://meisters-baton.vercel.app'],
    }),
  };
};
describe('loopback gateway', () => {
  it('runs a follow-up through the same authenticated team boundary', async () => {
    const { app, provider, fetcher } = setup();
    const token = `header.${Buffer.from(JSON.stringify({ role: 'authenticated', sub: 'user-1', exp: Date.now() / 1000 + 600 })).toString('base64url')}.test-only`;
    fetcher.mockImplementation(async (url: string) => {
      const u = new URL(url);
      const body =
        u.pathname === '/auth/v1/user'
          ? { id: 'user-1' }
          : u.searchParams.get('offset') !== '0'
            ? []
            : u.pathname.endsWith('team_members')
              ? [{ team_id: teamId }]
              : u.pathname.endsWith('propeller_wiki_sources')
                ? [
                    {
                      content: {
                        format: 'baton-growi-archive',
                        version: 1,
                        origin: 'https://wiki2.meister.tech',
                        root: '/ペラ',
                        exportedAt: '2026-09-13',
                        expectedPages: 0,
                        pages: [],
                      },
                    },
                  ]
                : [];
      return new Response(JSON.stringify(body));
    });
    provider.mockResolvedValue({
      outcome: 'enough',
      message: 'この問いはここまでです。',
      question: null,
    });
    const response = await request(app)
      .post('/api/ai/followup')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Baton-Team', teamId)
      .send({ recording: interviewFixture(), questionId: 'q1' });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.review.answerId).toBe('a1');
    expect(provider).toHaveBeenCalledTimes(1);
    expect(
      (
        await request(app)
          .post('/api/ai/followup')
          .set('Authorization', `Bearer ${token}`)
          .set('X-Baton-Team', 'other-team')
          .send({})
      ).status,
    ).toBe(403);
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it('rejects unrelated origins and DNS rebinding before network or inference', async () => {
    const { app, provider, fetcher } = setup();
    expect(
      (await request(app).get('/api/health').set('Origin', 'https://attacker.example')).status,
    ).toBe(403);
    expect((await request(app).get('/api/health').set('Host', 'attacker.example')).status).toBe(
      403,
    );
    expect(provider).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('allows the configured frontend preflight', async () => {
    const { app } = setup();
    const response = await request(app)
      .options('/api/process-video')
      .set('Origin', 'https://meisters-baton.vercel.app')
      .set('Access-Control-Request-Method', 'POST');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://meisters-baton.vercel.app',
    );
  });
  it('does not run Codex for anonymous or other-team requests', async () => {
    const { app, provider, fetcher } = setup();
    expect(
      (
        await request(app)
          .post('/api/process-video')
          .send({ action: 'check', teamId, query: '外皮' })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post('/api/process-video')
          .send({ action: 'check', teamId: 'other', query: '外皮' })
      ).status,
    ).toBe(403);
    for (const action of ['analyze', 'followup', 'generate', 'search'])
      expect((await request(app).post(`/api/ai/${action}`).send({})).status).toBe(401);
    expect(provider).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not expose general proxy or command execution endpoints', async () => {
    const { app } = setup();
    expect((await request(app).post('/api/exec').send({ command: 'dir' })).status).toBe(404);
  });
});
