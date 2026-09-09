// @ts-nocheck -- The archive generator is an executable ESM module outside tsconfig.
import { describe, expect, it } from 'vitest';
import { importBackup } from '../src/lib/storage';
import {
  buildPropellerWikiBackup,
  requiredSourceMessageIds,
} from '../scripts/propeller-wiki-lib.mjs';

// Synthetic specifications only. Real Discord-derived content stays private.
const privateSpecifications = Array.from({ length: 8 }, (_, index) => ({
  slug: `fixture-${index}`,
  title: `架空の工程 ${index}`,
  category: '検証用',
  summary: '架空の資料だけを用いた生成テスト',
  tags: ['試験'],
  claims: Array.from({ length: index < 5 ? 4 : 3 }, (_, claim) => ({
    kind: 'step',
    title: '架空の確認項目',
    body: '実作業に使わない検証用の本文',
    sources: [String(800000000000000000n + BigInt(index * 10 + claim))],
  })),
}));

function sourceFixture() {
  const channelId = '223456789012345678';
  const messages = requiredSourceMessageIds(privateSpecifications).map((id, index) => ({
    id,
    channel_id: channelId,
    type: 0,
    timestamp: new Date(Date.UTC(2025, 0, 1, 0, index)).toISOString(),
    content: `根拠メッセージ ${id}`,
    author: { id: '323456789012345678', global_name: '先輩' },
    attachments: [],
  }));
  return {
    manifest: {
      format: 'meisters-baton-discord-archive',
      version: 1,
      exportedAt: '2026-09-08T00:00:00.000Z',
      source: {
        guildId: '123456789012345678',
        categoryId: '423456789012345678',
      },
      locations: [{ id: channelId, parentId: '423456789012345678', name: 'ペラ日記', type: 0 }],
      attachments: [],
      stats: { messageCount: messages.length, attachmentCount: 0 },
    },
    messages,
  };
}

describe('propeller Wiki draft', () => {
  it('builds importable, source-backed drafts without claiming review', () => {
    const source = sourceFixture();
    const envelope = buildPropellerWikiBackup(
      source.manifest,
      source.messages,
      privateSpecifications,
    );
    const data = importBackup(JSON.stringify(envelope));
    expect(data.articles).toHaveLength(8);
    expect(data.articles.flatMap((article) => article.claims)).toHaveLength(29);
    expect(data.articles.every((article) => article.status === 'draft' && !article.isDemo)).toBe(
      true,
    );
    expect(
      data.articles
        .flatMap((article) => article.claims)
        .every(
          (claim) =>
            claim.review === 'draft' &&
            claim.evidence.length > 0 &&
            claim.evidence.every((evidence) =>
              evidence.sourceUrl?.startsWith('https://discord.com/'),
            ),
        ),
    ).toBe(true);
    expect(data.requests).toHaveLength(3);
  });

  it('stops instead of inventing a missing source message', () => {
    const source = sourceFixture();
    source.messages.pop();
    expect(() =>
      buildPropellerWikiBackup(source.manifest, source.messages, privateSpecifications),
    ).toThrow('Wiki根拠メッセージが見つかりません');
  });
});
