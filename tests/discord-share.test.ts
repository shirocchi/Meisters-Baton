// @ts-nocheck -- The production helper is an executable ESM module outside tsconfig.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildArchiveViewModel,
  buildSharePackage,
  markdownForLocation,
  renderViewerHtml,
  verifySharePackage,
} from '../scripts/discord-share-lib.mjs';

const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const guildId = '123456789012345678';
  const parentId = '223456789012345678';
  const threadId = '323456789012345678';
  const firstId = '423456789012345678';
  const secondId = '523456789012345678';
  const bytes = Buffer.from('image bytes');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const mediaPath = `media/${digest}__photo.jpg`;
  const messages = [
    {
      id: firstId,
      channel_id: parentId,
      type: 0,
      timestamp: '2026-09-08T01:02:03.000Z',
      edited_timestamp: null,
      content: `治具を確認 <@623456789012345678> https://discord.com/channels/${guildId}/${threadId}/${secondId}`,
      author: { id: '623456789012345678', username: 'senpai', global_name: '先輩' },
      attachments: [{ id: '723456789012345678', filename: 'photo.jpg' }],
      embeds: [],
    },
    {
      id: secondId,
      channel_id: threadId,
      type: 0,
      timestamp: '2026-09-09T01:02:03.000Z',
      edited_timestamp: null,
      content: '返信です',
      author: { id: '823456789012345678', username: 'kohai' },
      message_reference: { message_id: firstId },
      attachments: [],
      embeds: [],
    },
  ];
  const manifest = {
    source: { guildId, categoryName: 'プロペラ班' },
    scope: { excludedChannels: [] },
    locations: [
      { id: parentId, parentId: '923456789012345678', name: 'ペラ日記', type: 0 },
      { id: threadId, parentId, name: '積層', type: 11 },
    ],
    attachments: [
      {
        id: '723456789012345678',
        messageId: firstId,
        filename: 'photo.jpg',
        description: null,
        contentType: 'image/jpeg',
        responseContentType: 'image/jpeg',
        actualSize: bytes.length,
        declaredSize: bytes.length,
        declaredSizeMatches: true,
        mediaPath,
        sha256: digest,
        status: 'downloaded',
      },
    ],
    stats: { messageCount: 2, attachmentCount: 1, attachmentBytes: bytes.length },
  };
  return { manifest, messages, bytes, mediaPath, parentId, threadId, firstId, secondId };
}

describe('Discord share package', () => {
  it('keeps hierarchy, readable mentions, local media and resolvable internal links', () => {
    const item = fixture();
    const model = buildArchiveViewModel(item.manifest, item.messages);
    expect(model.locations.find((location) => location.id === item.parentId)?.children).toEqual([
      item.threadId,
    ]);
    expect(model.messages[0].content).toContain('@先輩');
    const markdown = markdownForLocation(model, item.parentId);
    expect(markdown).toContain('## 2026/9/8');
    expect(markdown).toContain('[Discord内リンク]');
    expect(decodeURI(markdown)).toContain('../01_一次アーカイブ/media/');
    const html = renderViewerHtml(model);
    expect(html).toContain('チャンネルとスレッド');
    expect(html).toContain('一次資料・未整理');
    expect(html).not.toContain('cdn.discordapp.com');
  });

  it('writes a verified, self-contained viewer and wiki import index', async () => {
    const item = fixture();
    const root = mkdtempSync(path.join(tmpdir(), 'baton-share-'));
    temporary.push(root);
    const archive = path.join(root, 'archive');
    const output = path.join(root, 'output');
    mkdirSync(path.join(archive, 'media'), { recursive: true });
    writeFileSync(path.join(archive, ...item.mediaPath.split('/')), item.bytes);
    writeFileSync(path.join(archive, 'manifest.json'), JSON.stringify(item.manifest));
    writeFileSync(
      path.join(archive, 'messages.jsonl'),
      `${item.messages.map((message) => JSON.stringify(message)).join('\n')}\n`,
    );
    const result = await buildSharePackage(archive, output);
    expect(result.sourceArchive.verified).toBe(true);
    expect(readFileSync(path.join(output, '02_閲覧用', 'index.html'), 'utf8')).toContain(
      'プロペラ班 Archive',
    );
    expect(readFileSync(path.join(output, '03_Wiki取込用', 'INDEX.md'), 'utf8')).toContain('積層');
    expect(readFileSync(path.join(output, '00_はじめに.md'), 'utf8')).not.toContain('TOKEN');
    expect(await verifySharePackage(archive, output)).toMatchObject({
      ok: true,
      messageCount: 2,
      attachmentCount: 1,
      markdownPageCount: 2,
    });
  });
});
