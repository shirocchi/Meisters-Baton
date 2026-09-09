import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clampMonitor,
  getPropellerPage,
  getReadingStep,
  propellerPages,
  searchPropellerPages,
} from '../src/domain/propellerWiki';
import { loadPropellerSources } from '../src/lib/propellerSources';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('standard propeller wiki', () => {
  it('has unique addressable pages and step IDs without bundling private Discord evidence', () => {
    expect(new Set(propellerPages.map((page) => page.slug)).size).toBe(8);
    for (const page of propellerPages) {
      expect(getPropellerPage(page.slug)).toBe(page);
      expect(new Set(page.steps.map((step) => step.id)).size).toBe(page.steps.length);
      expect(page.steps.length).toBeGreaterThan(1);
    }
    expect(JSON.stringify(propellerPages)).not.toMatch(
      /discord\.com|sourceUrl|sourceAttachments|\d{17,20}/,
    );
    expect(getPropellerPage('not-a-page')).toBeUndefined();
  });
  it('searches the hierarchy and page text, and reports unknown terms as empty', () => {
    expect(searchPropellerPages('　真空　').map((page) => page.slug)).toContain('skin-lamination');
    expect(searchPropellerPages('ブレード製作 外皮').length).toBeGreaterThan(0);
    expect(searchPropellerPages('存在しない工程999')).toEqual([]);
  });
  it('keeps the current section selected across gaps and in both scrolling directions', () => {
    expect(getReadingStep([400, 800, 1200], 200)).toBe(0);
    expect(getReadingStep([-500, -100, 300], 200)).toBe(1);
    expect(getReadingStep([-900, -500, -100], 200)).toBe(2);
    expect(getReadingStep([-400, 0, 400], 200)).toBe(1);
  });
  it('keeps a dragged monitor reachable and above mobile navigation', () => {
    expect(clampMonitor(-600, -50, 256, 260, 390, 844)).toEqual({ x: 8, y: 8 });
    expect(clampMonitor(800, 999, 256, 260, 390, 844)).toEqual({ x: 126, y: 496 });
    expect(clampMonitor(1800, 900, 340, 350, 1280, 900)).toEqual({ x: 932, y: 538 });
  });
  it('uses authenticated requests without browser cache and does not convert access errors to success', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-publishable');
    const fetcher = vi.fn().mockResolvedValue(new Response('[]'));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    await expect(
      loadPropellerSources('skin-lamination', 'test-token', controller.signal),
    ).resolves.toBeNull();
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      cache: 'no-store',
      signal: controller.signal,
      headers: { Authorization: 'Bearer test-token' },
    });
    fetcher.mockResolvedValue(new Response('', { status: 403 }));
    await expect(
      loadPropellerSources('skin-lamination', 'bad-token', controller.signal),
    ).rejects.toThrow('開発メンバー権限');
  });
});
