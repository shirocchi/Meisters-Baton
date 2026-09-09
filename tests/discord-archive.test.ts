// @ts-nocheck -- The production archive helper is an executable ESM module outside tsconfig.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertSnowflake,
  attachmentRecords,
  discordArchiveDate,
  discordMessageLinks,
  linkReferences,
  mirrorMessageBody,
  mirrorMessageText,
  normalizeDiscordReturnedContent,
  rewriteDiscordMessageLinks,
  safeFilename,
  sortMessages,
  splitDiscordContent,
  verifyArchiveFiles,
} from '../scripts/discord-archive-lib.mjs';

const temporary = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function message(overrides = {}) {
  return {
    id: '123456789012345678',
    channel_id: '223456789012345678',
    timestamp: '2026-09-08T01:02:03.000Z',
    edited_timestamp: null,
    content: '桁位置を確認した。',
    author: { id: '323456789012345678', username: '先輩', global_name: '先輩A' },
    attachments: [],
    reactions: [],
    ...overrides,
  };
}

describe('Discord archive helpers', () => {
  it('accepts only Discord snowflake-shaped ids', () => {
    expect(assertSnowflake('123456789012345678')).toBe('123456789012345678');
    expect(() => assertSnowflake('not-an-id')).toThrow(/数値ID/);
  });

  it('sanitizes attachment names without discarding their meaning', () => {
    expect(safeFilename('翼桁:確認?.mp4')).toBe('翼桁_確認_.mp4');
  });

  it('orders same-time messages by snowflake and splits long content', () => {
    const ordered = sortMessages([
      message({ id: '123456789012345679' }),
      message({ id: '123456789012345678' }),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(['123456789012345678', '123456789012345679']);
    expect(splitDiscordContent('a'.repeat(3900))).toHaveLength(3);
  });

  it('retains original timestamp, author, reply and reactions for the mirror', () => {
    const rendered = mirrorMessageText(
      message({
        message_reference: { message_id: '423456789012345678' },
        reactions: [{ emoji: { name: '👍' }, count: 3 }],
      }),
    );
    expect(rendered).toContain('2026-09-08T01:02:03.000Z');
    expect(rendered).toContain('先輩A');
    expect(rendered).toContain('423456789012345678');
    expect(rendered).toContain('👍×3');
  });

  it('renders the existing-structure mirror without migration metadata or reactions', () => {
    const sourceGuild = '623456789012345678';
    const rendered = mirrorMessageBody(
      message({
        message_reference: {
          guild_id: sourceGuild,
          channel_id: '723456789012345678',
          message_id: '823456789012345678',
        },
        reactions: [{ emoji: { name: '👍' }, count: 3 }],
      }),
      sourceGuild,
      true,
    );
    expect(discordArchiveDate('2026-09-08T01:02:03.000Z')).toBe('2026/9/8');
    expect(rendered).toContain('## 2026/9/8');
    expect(rendered).toContain(
      `https://discord.com/channels/${sourceGuild}/723456789012345678/823456789012345678`,
    );
    expect(rendered).toContain('桁位置を確認した。');
    expect(rendered).not.toContain('移植記録');
    expect(rendered).not.toContain('リアクション');
    expect(rendered).not.toContain('01:02:03');
  });

  it('accounts for Discord trimming and inaccessible source-server emoji normalization', () => {
    expect(normalizeDiscordReturnedContent('本文<:quuu:1399612471647670272>\n')).toBe('本文:quuu:');
    expect(normalizeDiscordReturnedContent('<a:dance:1399612471647670272>')).toBe(':dance:');
  });

  it('classifies category links and rewrites only links from the source server', () => {
    const sourceGuild = '623456789012345678';
    const includedChannel = '723456789012345678';
    const linkedMessage = '823456789012345678';
    const content = [
      `https://discord.com/channels/${sourceGuild}/${includedChannel}/${linkedMessage}`,
      `https://discord.com/channels/${sourceGuild}/923456789012345678/923456789012345679`,
      'https://discord.com/channels/103456789012345678/113456789012345678/123456789012345680',
    ].join(' ');
    expect(discordMessageLinks(content)).toHaveLength(3);
    const references = linkReferences(
      [message({ content, channel_id: includedChannel })],
      sourceGuild,
      [includedChannel],
    );
    expect(references.map((item) => item.scope)).toEqual([
      'included-channel',
      'outside-category',
      'other-server',
    ]);
    const rewritten = rewriteDiscordMessageLinks(content, sourceGuild, ({ messageId }) =>
      messageId === linkedMessage
        ? 'https://discord.com/channels/133456789012345678/143456789012345678/153456789012345678'
        : null,
    );
    expect(rewritten).toContain('/133456789012345678/143456789012345678/153456789012345678');
    expect(rewritten).toContain('/923456789012345678/923456789012345679');
    expect(rewritten).toContain('/103456789012345678/113456789012345678/123456789012345680');
  });

  it('detects both intact and corrupted media by count, size and SHA-256', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'baton-discord-'));
    temporary.push(root);
    mkdirSync(path.join(root, 'media'));
    const bytes = Buffer.from('real image bytes');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const mediaPath = `media/${digest}__photo.jpg`;
    writeFileSync(path.join(root, ...mediaPath.split('/')), bytes);
    const messages = [
      message({
        attachments: [
          {
            id: '523456789012345678',
            filename: 'photo.jpg',
            content_type: 'image/jpeg',
            size: bytes.length,
            url: 'https://cdn.discordapp.com/example',
            proxy_url: 'https://media.discordapp.net/example',
          },
        ],
      }),
    ];
    const item = {
      ...attachmentRecords(messages)[0],
      mediaPath,
      sha256: digest,
      actualSize: bytes.length,
      status: 'downloaded',
    };
    expect(item.proxyUrl).toBe('https://media.discordapp.net/example');
    const manifest = {
      attachments: [item],
      stats: { messageCount: 1, attachmentCount: 1, attachmentBytes: bytes.length },
    };
    expect((await verifyArchiveFiles(root, manifest, messages)).ok).toBe(true);
    manifest.attachments[0] = {
      ...item,
      declaredSize: bytes.length - 1,
      declaredSizeMatches: false,
    };
    expect((await verifyArchiveFiles(root, manifest, messages)).ok).toBe(true);
    writeFileSync(path.join(root, ...mediaPath.split('/')), 'corrupt');
    const broken = await verifyArchiveFiles(root, manifest, messages);
    expect(broken.ok).toBe(false);
    expect(broken.errors.join('\n')).toMatch(/容量不一致|SHA-256不一致/);
  });
});
