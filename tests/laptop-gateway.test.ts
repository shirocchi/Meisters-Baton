import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createLaptopGateway } from '../server/laptopGateway';
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
    for (const action of ['analyze', 'generate', 'search'])
      expect((await request(app).post(`/api/ai/${action}`).send({})).status).toBe(401);
    expect(provider).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not expose general proxy or command execution endpoints', async () => {
    const { app } = setup();
    expect((await request(app).post('/api/exec').send({ command: 'dir' })).status).toBe(404);
  });
});
