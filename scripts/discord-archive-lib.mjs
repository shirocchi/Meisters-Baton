import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const ARCHIVE_FORMAT = 'meisters-baton-discord-archive';
export const ARCHIVE_VERSION = 1;

export function assertSnowflake(value, label = 'ID') {
  if (!/^\d{15,22}$/.test(value ?? ''))
    throw new Error(`${label}はDiscordの数値IDで指定してください。`);
  return value;
}

export function safeFilename(value) {
  const cleaned = String(value || 'attachment')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 160);
  return cleaned || 'attachment';
}

export function sortMessages(messages) {
  return [...messages].sort((left, right) => {
    const byTime = Date.parse(left.timestamp) - Date.parse(right.timestamp);
    if (byTime) return byTime;
    return BigInt(left.id) < BigInt(right.id) ? -1 : BigInt(left.id) > BigInt(right.id) ? 1 : 0;
  });
}

export function attachmentRecords(messages) {
  return messages.flatMap((message) =>
    (message.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      messageId: message.id,
      channelId: message.channel_id,
      filename: attachment.filename,
      description: attachment.description ?? null,
      contentType: attachment.content_type ?? null,
      declaredSize: attachment.size,
      width: attachment.width ?? null,
      height: attachment.height ?? null,
      durationSeconds: attachment.duration_secs ?? null,
      sourceUrl: attachment.url,
      proxyUrl: attachment.proxy_url ?? null,
      mediaPath: null,
      sha256: null,
      actualSize: null,
      status: 'pending',
      error: null,
    })),
  );
}

export async function sha256File(filename) {
  const hash = createHash('sha256');
  const stream = createReadStream(filename);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

export async function verifyArchiveFiles(root, manifest, messages) {
  const errors = [];
  const seenMessages = new Set();
  for (const message of messages) {
    if (!message?.id || seenMessages.has(message.id))
      errors.push(`メッセージID重複または欠落: ${message?.id ?? '(なし)'}`);
    seenMessages.add(message?.id);
  }
  const expectedAttachments = attachmentRecords(messages);
  const expectedIds = new Set(expectedAttachments.map((item) => item.id));
  const actualIds = new Set(manifest.attachments.map((item) => item.id));
  for (const id of expectedIds) if (!actualIds.has(id)) errors.push(`添付マニフェスト欠落: ${id}`);
  for (const id of actualIds)
    if (!expectedIds.has(id)) errors.push(`対応メッセージのない添付: ${id}`);

  let totalBytes = 0;
  for (const item of manifest.attachments) {
    if (item.status !== 'downloaded' || !item.mediaPath || !item.sha256) {
      errors.push(`未取得の添付: ${item.id} ${item.filename}`);
      continue;
    }
    const filename = path.resolve(root, ...item.mediaPath.split('/'));
    try {
      const info = await stat(filename);
      totalBytes += info.size;
      if (info.size !== item.actualSize)
        errors.push(`実体容量不一致: ${item.id} manifest=${item.actualSize} actual=${info.size}`);
      const digest = await sha256File(filename);
      if (digest !== item.sha256) errors.push(`SHA-256不一致: ${item.id} ${item.filename}`);
    } catch (cause) {
      errors.push(`添付ファイル欠落: ${item.id} ${cause instanceof Error ? cause.message : ''}`);
    }
  }
  if (manifest.stats.messageCount !== messages.length)
    errors.push(
      `メッセージ件数不一致: manifest=${manifest.stats.messageCount} actual=${messages.length}`,
    );
  if (manifest.stats.attachmentCount !== manifest.attachments.length)
    errors.push(
      `添付件数不一致: manifest=${manifest.stats.attachmentCount} actual=${manifest.attachments.length}`,
    );
  if (manifest.stats.attachmentBytes !== totalBytes)
    errors.push(
      `添付総容量不一致: manifest=${manifest.stats.attachmentBytes} actual=${totalBytes}`,
    );
  return {
    ok: errors.length === 0,
    errors,
    messageCount: messages.length,
    attachmentCount: manifest.attachments.length,
    attachmentBytes: totalBytes,
  };
}

export function splitDiscordContent(value, limit = 1900) {
  const text = String(value ?? '');
  if (!text) return ['（本文なし）'];
  const chunks = [];
  let rest = text;
  while (rest.length > limit) {
    let index = rest.lastIndexOf('\n', limit);
    if (index < Math.floor(limit * 0.55)) index = limit;
    chunks.push(rest.slice(0, index));
    rest = rest.slice(index).replace(/^\n/, '');
  }
  if (rest || !chunks.length) chunks.push(rest);
  return chunks;
}

export function mirrorMessageText(message) {
  const author = message.author?.global_name || message.author?.username || '不明な投稿者';
  const edited = message.edited_timestamp ? ` / 編集 ${message.edited_timestamp}` : '';
  const header = `【移植記録｜${message.timestamp}${edited}｜${author}】`;
  const reply = message.message_reference?.message_id
    ? `\n↪ 元メッセージ ${message.message_reference.message_id} への返信`
    : '';
  const reactions = (message.reactions ?? [])
    .map((item) => `${item.emoji?.name ?? 'emoji'}×${item.count}`)
    .join(' ');
  const footer = reactions ? `\nリアクション: ${reactions}` : '';
  return `${header}${reply}\n${message.content || '（本文なし）'}${footer}`;
}

export function discordArchiveDate(value, timeZone = 'Asia/Tokyo') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}/${part('month')}/${part('day')}`;
}

export function mirrorMessageBody(message, sourceGuildId, includeDateHeading = false) {
  const reference = message.message_reference;
  const reply = reference?.message_id
    ? `[↪ 返信先](https://discord.com/channels/${reference.guild_id || sourceGuildId}/${reference.channel_id || message.channel_id}/${reference.message_id})\n`
    : '';
  const heading = includeDateHeading ? `## ${discordArchiveDate(message.timestamp)}\n` : '';
  return `${heading}${reply}${message.content || ''}`;
}

export function normalizeDiscordReturnedContent(value) {
  return String(value ?? '')
    .replace(/<a?:([A-Za-z0-9_]+):\d+>/g, ':$1:')
    .trimEnd();
}

const DISCORD_MESSAGE_LINK =
  /https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/gi;

export function discordMessageLinks(value) {
  return [...String(value ?? '').matchAll(DISCORD_MESSAGE_LINK)].map((match) => ({
    url: match[0],
    guildId: match[1],
    channelId: match[2],
    messageId: match[3],
  }));
}

export function linkReferences(messages, sourceGuildId, includedChannelIds) {
  const included = new Set(includedChannelIds);
  const messageIds = new Set(messages.map((message) => message.id));
  return messages.flatMap((message) =>
    discordMessageLinks(message.content).map((link) => ({
      sourceMessageId: message.id,
      sourceChannelId: message.channel_id,
      ...link,
      scope:
        link.guildId !== sourceGuildId
          ? 'other-server'
          : included.has(link.channelId)
            ? 'included-channel'
            : 'outside-category',
      targetMessagePresent: messageIds.has(link.messageId),
    })),
  );
}

export function rewriteDiscordMessageLinks(value, sourceGuildId, resolveDestination) {
  return String(value ?? '').replace(DISCORD_MESSAGE_LINK, (url, guildId, channelId, messageId) => {
    if (guildId !== sourceGuildId) return url;
    return resolveDestination({ guildId, channelId, messageId }) ?? url;
  });
}

export async function readJsonLines(filename) {
  const text = await readFile(filename, 'utf8');
  if (!text.trim()) return [];
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`messages.jsonl の${index + 1}行目を解析できません。`);
      }
    });
}
