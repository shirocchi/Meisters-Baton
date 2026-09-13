import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import sources from '../src/components/book/photoSources.json';
import { PROCESS_STEPS } from '../src/components/atlas/processStages';

describe('published photo bookmarks', () => {
  it('keeps every selected photo next to a real process and ships every asset', () => {
    const media = Object.values(sources.stages).flatMap((stage) =>
      stage.practice.flatMap((p) => p.media),
    );
    expect(media).toHaveLength(71);
    expect(new Set(media.map((m) => m.asset)).size).toBe(71);
    for (const [stage, content] of Object.entries(sources.stages)) {
      for (const practice of content.practice) {
        if (stage !== 'overview')
          expect(PROCESS_STEPS[stage].some((step) => step.id === practice.stepId)).toBe(true);
        for (const photo of practice.media) {
          expect(existsSync(`public/${photo.asset}`)).toBe(true);
          expect(photo.width).toBeGreaterThan(0);
          expect(photo.height).toBeGreaterThan(0);
          expect(photo.caption.length).toBeGreaterThan(15);
          expect(photo.url).toMatch(/^https:\/\/discord.com\/channels\/\d+\/\d+\/\d+$/);
        }
      }
    }
  });
  it('publishes edited evidence without local paths, credentials, or raw archive fields', () => {
    const json = readFileSync('src/components/book/photoSources.json', 'utf8');
    expect(json).not.toMatch(
      /\/Users\/|sourceRoot|sourceUrl|proxy_url|avatar|mention_roles|cdn.discordapp|localUrl/,
    );
  });
});
