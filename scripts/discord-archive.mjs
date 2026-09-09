import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  ARCHIVE_FORMAT,
  ARCHIVE_VERSION,
  assertSnowflake,
  attachmentRecords,
  discordArchiveDate,
  discordMessageLinks,
  linkReferences,
  mirrorMessageBody,
  mirrorMessageText,
  normalizeDiscordReturnedContent,
  readJsonLines,
  rewriteDiscordMessageLinks,
  safeFilename,
  sha256File,
  sortMessages,
  splitDiscordContent,
  verifyArchiveFiles,
} from './discord-archive-lib.mjs';

const API = 'https://discord.com/api/v10';
const args = parseArgs(process.argv.slice(2));
const command = args._[0];

function parseArgs(values) {
  const parsed = { _: [] };
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (!value.startsWith('--')) parsed._.push(value);
    else if (
      ['--apply', '--skip-forum', '--use-discord-previews-for-oversized-images'].includes(value)
    )
      parsed[value.slice(2)] = true;
    else {
      const next = values[++index];
      if (!next || next.startsWith('--')) throw new Error(`${value} の値がありません。`);
      const key = value.slice(2);
      if (['thread', 'exclude-channel', 'include-channel', 'include-thread'].includes(key))
        parsed[key] = [...(parsed[key] ?? []), next];
      else parsed[key] = next;
    }
  }
  return parsed;
}

function usage() {
  console.log(`Meister's Baton Discord archive

Export (source server; read-only):
  npm run discord:archive -- export --category CATEGORY_ID --out PATH [--thread THREAD_ID] [--exclude-channel CHANNEL_ID]

Single-channel export (legacy/small scope):
  npm run discord:archive -- export --channel CHANNEL_ID --out PATH [--thread THREAD_ID]

Verify an archive without Discord access:
  npm run discord:archive -- verify --archive PATH

Preview destination writes (default; no messages are posted):
  npm run discord:archive -- mirror --archive PATH --destination-category CATEGORY_ID

Post after reviewing the preview:
  npm run discord:archive -- mirror --archive PATH --destination-category CATEGORY_ID --apply

Mirror only named channels/threads into an existing matching structure:
  npm run discord:archive -- mirror-existing --archive PATH --destination-category CATEGORY_ID \\
    --include-channel CHANNEL_NAME --include-thread PARENT_NAME/THREAD_NAME [--apply]

Remove only webhook messages recorded by an interrupted existing-structure mirror:
  npm run discord:archive -- rollback-existing --state STATE_JSON [--apply]

Verify every recorded destination message against the archive and Discord:
  npm run discord:archive -- verify-existing --archive PATH --state STATE_JSON

Use Discord-generated image previews when originals exceed the destination limit:
  add --use-discord-previews-for-oversized-images

Environment:
  DISCORD_SOURCE_BOT_TOKEN       source export token (read-only bot)
  DISCORD_DESTINATION_BOT_TOKEN  destination mirror token
  DISCORD_WEBHOOK_NAME           optional, default "ペラ日記アーカイブ"
`);
}

async function writeJsonAtomic(filename, value) {
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rm(filename, { force: true });
  await rename(temporary, filename);
}

async function writeJsonLinesAtomic(filename, values) {
  const temporary = `${filename}.tmp`;
  await writeFile(
    temporary,
    `${values.map((value) => JSON.stringify(value)).join('\n')}\n`,
    'utf8',
  );
  await rm(filename, { force: true });
  await rename(temporary, filename);
}

function requireToken() {
  const key = command === 'export' ? 'DISCORD_SOURCE_BOT_TOKEN' : 'DISCORD_DESTINATION_BOT_TOKEN';
  const token = process.env[key]?.trim();
  if (!token)
    throw new Error(`${key} がありません。トークンはチャットやGitへ保存しないでください。`);
  return token;
}

async function discord(pathname, options = {}) {
  const token = options.token ?? requireToken();
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(`${API}${pathname}`, {
      ...options,
      headers: {
        Authorization: `Bot ${token}`,
        'User-Agent': 'DiscordBot (https://github.com/kob952/Meisters-Baton, 0.1)',
        ...options.headers,
      },
    });
    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      const seconds = Number(body.retry_after ?? response.headers.get('retry-after') ?? 1);
      await new Promise((resolve) => setTimeout(resolve, Math.max(250, seconds * 1000)));
      continue;
    }
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Discord API ${response.status} ${pathname}: ${detail.slice(0, 500)}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }
  throw new Error(`Discord APIの制限から復帰できませんでした: ${pathname}`);
}

async function allMessages(channelId) {
  const messages = [];
  let before;
  while (true) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);
    const page = await discord(`/channels/${channelId}/messages?${query}`);
    messages.push(...page);
    console.log(`取得: channel=${channelId} ${messages.length}件`);
    if (page.length < 100) break;
    before = page.at(-1).id;
  }
  return messages;
}

async function selectedThreads(threadIds, parentIds) {
  const threads = [];
  for (const rawId of threadIds ?? []) {
    const threadId = assertSnowflake(rawId, 'スレッドID');
    const thread = await discord(`/channels/${threadId}`);
    if (!parentIds.has(thread.parent_id))
      throw new Error(`スレッド ${threadId} は選択範囲内のチャンネルの子ではありません。`);
    threads.push(thread);
  }
  return threads;
}

async function archivedThreads(channelId, kind) {
  const threads = [];
  let before;
  while (true) {
    const query = new URLSearchParams({ limit: '100' });
    if (before) query.set('before', before);
    const route =
      kind === 'joined-private'
        ? `/channels/${channelId}/users/@me/threads/archived/private?${query}`
        : `/channels/${channelId}/threads/archived/public?${query}`;
    const page = await discord(route);
    threads.push(...page.threads);
    if (!page.has_more || !page.threads.length) break;
    const last = page.threads.at(-1);
    before = kind === 'joined-private' ? last.id : last.thread_metadata?.archive_timestamp;
    if (!before) throw new Error(`スレッド一覧のページング基準がありません: ${channelId}`);
  }
  return threads;
}

async function discoveredThreads(guildId, parentChannels, skipForum) {
  const selectedParents = parentChannels.filter(
    (item) => !(skipForum && [15, 16].includes(item.type)),
  );
  const parentIds = new Set(selectedParents.map((item) => item.id));
  const activeResult = await discord(`/guilds/${guildId}/threads/active`);
  const active = activeResult.threads.filter((thread) => parentIds.has(thread.parent_id));
  const archived = [];
  for (const parent of selectedParents) {
    if (![0, 5, 15, 16].includes(parent.type)) continue;
    archived.push(...(await archivedThreads(parent.id, 'public')));
    if ([0, 5].includes(parent.type))
      archived.push(...(await archivedThreads(parent.id, 'joined-private')));
  }
  const unique = new Map();
  for (const thread of [...active, ...archived]) unique.set(thread.id, thread);
  return [...unique.values()];
}

async function archiveLocations() {
  if (args.category && args.channel)
    throw new Error('--category と --channel は同時に指定できません。');
  if (args.category) {
    const categoryId = assertSnowflake(args.category, 'カテゴリID');
    const category = await discord(`/channels/${categoryId}`);
    if (category.type !== 4) throw new Error(`${categoryId} はDiscordカテゴリではありません。`);
    // Discord has no "list category children" endpoint. Fetch guild channel metadata once,
    // immediately discard out-of-scope entries, and never request their message history.
    const guildChannels = await discord(`/guilds/${category.guild_id}/channels`);
    const allChildren = guildChannels
      .filter((item) => item.parent_id === categoryId)
      .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name));
    const excludedIds = new Set(
      (args['exclude-channel'] ?? []).map((item) => assertSnowflake(item, '除外チャンネルID')),
    );
    const unknownExclusions = [...excludedIds].filter(
      (id) => !allChildren.some((item) => item.id === id),
    );
    if (unknownExclusions.length)
      throw new Error(
        `除外指定は対象カテゴリ直下のチャンネルではありません: ${unknownExclusions.join(', ')}`,
      );
    const excludedChannels = allChildren.filter((item) => excludedIds.has(item.id));
    const children = allChildren.filter((item) => !excludedIds.has(item.id));
    const readable = children.filter((item) => [0, 2, 5].includes(item.type));
    const forumLike = children.filter((item) => [15, 16].includes(item.type));
    const explicitThreads = await selectedThreads(
      args.thread,
      new Set(children.map((item) => item.id)),
    );
    const automaticThreads = await discoveredThreads(
      category.guild_id,
      [...readable, ...forumLike],
      args['skip-forum'],
    );
    const threadMap = new Map();
    for (const thread of [...automaticThreads, ...explicitThreads])
      threadMap.set(thread.id, thread);
    const threads = [...threadMap.values()];
    if (!readable.length)
      throw new Error('カテゴリ内に書き出し可能なテキスト履歴チャンネルがありません。');
    return {
      source: {
        mode: 'category',
        guildId: category.guild_id,
        categoryId,
        categoryName: category.name,
      },
      scope: {
        categoryChildren: true,
        guildChannelMetadataWasEnumerated: true,
        publicAndJoinedThreadsAutoDiscovered: true,
        excludedChannels: excludedChannels.map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
        })),
        forumChannelsExplicitlySkipped: args['skip-forum'] ? forumLike.map((item) => item.id) : [],
        threadIds: threads.map((thread) => thread.id),
        skippedNonMessageChannels: children
          .filter((item) => ![0, 2, 5, 15, 16].includes(item.type))
          .map((item) => ({ id: item.id, name: item.name, type: item.type })),
      },
      locations: [...readable, ...(args['skip-forum'] ? [] : forumLike), ...threads],
      messageLocations: [...readable, ...threads],
    };
  }
  const channelId = assertSnowflake(args.channel, 'チャンネルID');
  const channel = await discord(`/channels/${channelId}`);
  if (String(channel.id) !== channelId)
    throw new Error('取得したチャンネルIDが要求と一致しません。');
  const threads = await selectedThreads(args.thread, new Set([channelId]));
  return {
    source: {
      mode: 'channel',
      guildId: channel.guild_id,
      channelId,
      channelName: channel.name,
    },
    scope: {
      parentChannel: true,
      explicitlySelectedThreadsOnly: true,
      threadIds: threads.map((thread) => thread.id),
    },
    locations: [channel, ...threads],
    messageLocations: [channel, ...threads],
  };
}

async function downloadAttachment(item, root) {
  const temporaryDirectory = path.join(root, '.partial');
  await mkdir(temporaryDirectory, { recursive: true });
  const temporary = path.join(temporaryDirectory, `${item.id}.part`);
  const response = await fetch(item.sourceUrl);
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  const hash = createHash('sha256');
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(response.body, meter, createWriteStream(temporary));
  const digest = hash.digest('hex');
  const relative = path.posix.join('media', `${digest}__${safeFilename(item.filename)}`);
  const destination = path.join(root, ...relative.split('/'));
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await stat(destination);
    await rm(temporary, { force: true });
  } catch {
    await rename(temporary, destination);
  }
  return {
    ...item,
    mediaPath: relative,
    sha256: digest,
    actualSize: bytes,
    declaredSizeMatches: bytes === item.declaredSize,
    responseContentType: response.headers.get('content-type'),
    status: 'downloaded',
    error: null,
  };
}

async function downloadMirrorPreview(item, proxyUrl, root, maximum) {
  const response = await fetch(proxyUrl);
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/'))
    throw new Error(`画像ではない応答です: ${contentType || '(content-typeなし)'}`);
  const partialRoot = path.join(root, '.partial');
  await mkdir(partialRoot, { recursive: true });
  const temporary = path.join(partialRoot, `${item.id}.preview.part`);
  const hash = createHash('sha256');
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(response.body, meter, createWriteStream(temporary));
  if (bytes > maximum) {
    await rm(temporary, { force: true });
    throw new Error(`Discordプレビューも上限超過です: ${bytes} > ${maximum}`);
  }
  const digest = hash.digest('hex');
  const relative = path.posix.join('mirror-media', `${digest}__${safeFilename(item.filename)}`);
  const destination = path.join(root, ...relative.split('/'));
  await mkdir(path.dirname(destination), { recursive: true });
  try {
    await stat(destination);
    await rm(temporary, { force: true });
  } catch {
    await rename(temporary, destination);
  }
  return {
    attachmentId: item.id,
    originalMediaPath: item.mediaPath,
    originalActualSize: item.actualSize,
    originalSha256: item.sha256,
    mediaPath: relative,
    actualSize: bytes,
    sha256: digest,
    contentType,
    source: 'discord-proxy-preview',
  };
}

async function prepareMirrorPreviews(archive, oversized, maximum) {
  const statePath = path.join(archive.root, 'mirror-media.json');
  let state = { maximum, previews: {} };
  try {
    state = JSON.parse(await readFile(statePath, 'utf8'));
  } catch {}
  state.maximum = maximum;
  state.previews ??= {};
  const rawAttachments = new Map();
  for (const message of archive.messages)
    for (const attachment of message.attachments ?? [])
      rawAttachments.set(attachment.id, attachment);
  for (let index = 0; index < oversized.length; index++) {
    const item = oversized[index];
    const existing = state.previews[item.id];
    if (existing?.mediaPath && existing.actualSize <= maximum) {
      try {
        const info = await stat(path.join(archive.root, ...existing.mediaPath.split('/')));
        if (
          info.size === existing.actualSize &&
          (await sha256File(path.join(archive.root, ...existing.mediaPath.split('/')))) ===
            existing.sha256
        )
          continue;
      } catch {}
    }
    const proxyUrl = item.proxyUrl ?? rawAttachments.get(item.id)?.proxy_url;
    if (!proxyUrl) throw new Error(`DiscordプレビューURLがありません: ${item.id}`);
    state.previews[item.id] = await downloadMirrorPreview(item, proxyUrl, archive.root, maximum);
    await writeJsonAtomic(statePath, state);
    console.log(
      `プレビュー準備: ${index + 1}/${oversized.length} ${item.filename} ${item.actualSize} -> ${state.previews[item.id].actualSize}`,
    );
  }
  return new Map(oversized.map((item) => [item.id, state.previews[item.id]]));
}

async function exportArchive() {
  if (!args.out) throw new Error('--out が必要です。');
  const root = path.resolve(args.out);
  await mkdir(root, { recursive: true });
  const selection = await archiveLocations();
  const { locations, messageLocations } = selection;
  const messages = [];
  for (const location of messageLocations) messages.push(...(await allMessages(location.id)));
  const uniqueMessages = new Map();
  for (const message of messages) {
    const existing = uniqueMessages.get(message.id);
    if (!existing || (!existing.content && message.content))
      uniqueMessages.set(message.id, message);
  }
  const ordered = sortMessages([...uniqueMessages.values()]);
  if (
    ordered.length &&
    !ordered.some(
      (message) =>
        message.content ||
        message.attachments?.length ||
        message.embeds?.length ||
        message.sticker_items?.length ||
        message.poll,
    )
  )
    throw new Error(
      'メッセージは存在しますが本文・添付を取得できません。Message Content Intentを確認してください。',
    );
  await writeJsonLinesAtomic(path.join(root, 'messages.jsonl'), ordered);

  const partialPath = path.join(root, 'manifest.partial.json');
  let previous = { attachments: [] };
  try {
    previous = JSON.parse(await readFile(partialPath, 'utf8'));
  } catch {}
  const completed = new Map(previous.attachments.map((item) => [item.id, item]));
  const attachments = attachmentRecords(ordered);
  for (let index = 0; index < attachments.length; index++) {
    const item = attachments[index];
    const existing = completed.get(item.id);
    if (existing?.status === 'downloaded' && existing.mediaPath) {
      try {
        const info = await stat(path.join(root, ...existing.mediaPath.split('/')));
        if (info.size === existing.actualSize) {
          attachments[index] = existing;
          continue;
        }
      } catch {}
    }
    try {
      attachments[index] = await downloadAttachment(item, root);
      console.log(`添付: ${index + 1}/${attachments.length} ${item.filename}`);
      if (!attachments[index].declaredSizeMatches)
        console.warn(
          `  Discord申告差異: declared=${item.declaredSize} actual=${attachments[index].actualSize}`,
        );
    } catch (cause) {
      attachments[index] = {
        ...item,
        status: 'failed',
        error: cause instanceof Error ? cause.message : String(cause),
      };
      console.error(`添付失敗: ${item.filename} ${attachments[index].error}`);
    }
    await writeJsonAtomic(partialPath, {
      source: selection.source,
      attachments: attachments.slice(0, index + 1),
    });
  }

  const downloaded = attachments.filter((item) => item.status === 'downloaded');
  const references = linkReferences(
    ordered,
    selection.source.guildId,
    locations.map((item) => item.id),
  );
  const manifest = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    source: selection.source,
    scope: selection.scope,
    locations: locations.map((item) => ({
      id: item.id,
      parentId: item.parent_id ?? null,
      name: item.name,
      type: item.type,
    })),
    attachments,
    linkReferences: references,
    stats: {
      messageCount: ordered.length,
      attachmentCount: attachments.length,
      attachmentBytes: downloaded.reduce((sum, item) => sum + item.actualSize, 0),
      failedAttachments: attachments.length - downloaded.length,
      declaredSizeMismatchCount: downloaded.filter((item) => !item.declaredSizeMatches).length,
      messageLinkCount: references.length,
      unresolvedLinkCount: references.filter(
        (item) => item.scope !== 'included-channel' || !item.targetMessagePresent,
      ).length,
    },
  };
  await writeJsonAtomic(path.join(root, 'manifest.json'), manifest);
  const result = await verifyArchiveFiles(root, manifest, ordered);
  if (!result.ok) throw new Error(`アーカイブ検証失敗:\n${result.errors.join('\n')}`);
  await rm(partialPath, { force: true });
  console.log(
    `完了: メッセージ${result.messageCount}件 / 添付${result.attachmentCount}件 / ${result.attachmentBytes} bytes`,
  );
}

async function loadArchive(rootValue) {
  if (!rootValue) throw new Error('--archive が必要です。');
  const root = path.resolve(rootValue);
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.format !== ARCHIVE_FORMAT || manifest.version !== ARCHIVE_VERSION)
    throw new Error('対応していないアーカイブ形式です。');
  const messages = await readJsonLines(path.join(root, 'messages.jsonl'));
  return { root, manifest, messages };
}

async function verifyArchive() {
  const archive = await loadArchive(args.archive);
  const result = await verifyArchiveFiles(archive.root, archive.manifest, archive.messages);
  console.log(
    `検証: メッセージ${result.messageCount}件 / 添付${result.attachmentCount}件 / ${result.attachmentBytes} bytes`,
  );
  if (!result.ok) throw new Error(result.errors.join('\n'));
  console.log('OK: 件数・容量・SHA-256が一致しました。');
}

async function ensureWebhook(channelId, suffix = '') {
  const baseName = process.env.DISCORD_WEBHOOK_NAME?.trim() || 'ペラ日記アーカイブ';
  const name = suffix ? `${baseName} ${suffix}` : baseName;
  const hooks = await discord(`/channels/${channelId}/webhooks`);
  const existing = hooks.find((item) => item.name === name && item.token);
  if (existing) return existing;
  return discord(`/channels/${channelId}/webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

async function executeWebhook(webhook, payload, files = [], options = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    let body;
    let headers;
    if (files.length) {
      body = new FormData();
      body.set('payload_json', JSON.stringify(payload));
      files.forEach((file, index) => body.set(`files[${index}]`, file.blob, file.filename));
    } else {
      body = JSON.stringify(payload);
      headers = { 'Content-Type': 'application/json' };
    }
    const query = new URLSearchParams({ wait: 'true' });
    if (options.threadId) query.set('thread_id', options.threadId);
    const response = await fetch(`${API}/webhooks/${webhook.id}/${webhook.token}?${query}`, {
      method: 'POST',
      headers,
      body,
    });
    if (response.status === 429) {
      const detail = await response.json().catch(() => ({}));
      const seconds = Number(detail.retry_after ?? response.headers.get('retry-after') ?? 1);
      await new Promise((resolve) => setTimeout(resolve, Math.max(250, seconds * 1000)));
      continue;
    }
    if (!response.ok)
      throw new Error(`Webhook ${response.status}: ${(await response.text()).slice(0, 500)}`);
    return response.json();
  }
  throw new Error('Webhookの制限から復帰できませんでした。');
}

async function editWebhookMessage(webhook, messageId, content, options = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const query = new URLSearchParams();
    if (options.threadId) query.set('thread_id', options.threadId);
    const suffix = query.size ? `?${query}` : '';
    const response = await fetch(
      `${API}/webhooks/${webhook.id}/${webhook.token}/messages/${messageId}${suffix}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
      },
    );
    if (response.status === 429) {
      const detail = await response.json().catch(() => ({}));
      const seconds = Number(detail.retry_after ?? response.headers.get('retry-after') ?? 1);
      await new Promise((resolve) => setTimeout(resolve, Math.max(250, seconds * 1000)));
      continue;
    }
    if (!response.ok)
      throw new Error(`Webhook edit ${response.status}: ${(await response.text()).slice(0, 500)}`);
    return response.json();
  }
  throw new Error('Webhook編集の制限から復帰できませんでした。');
}

async function getWebhookMessage(webhook, messageId, options = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const query = new URLSearchParams();
    if (options.threadId) query.set('thread_id', options.threadId);
    const suffix = query.size ? `?${query}` : '';
    const response = await fetch(
      `${API}/webhooks/${webhook.id}/${webhook.token}/messages/${messageId}${suffix}`,
    );
    if (response.status === 429) {
      const detail = await response.json().catch(() => ({}));
      const seconds = Number(detail.retry_after ?? response.headers.get('retry-after') ?? 1);
      await new Promise((resolve) => setTimeout(resolve, Math.max(250, seconds * 1000)));
      continue;
    }
    if (!response.ok)
      throw new Error(`Webhook get ${response.status}: ${(await response.text()).slice(0, 500)}`);
    return response.json();
  }
  throw new Error('Webhook取得の制限から復帰できませんでした。');
}

async function deleteWebhookMessage(webhook, messageId, options = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const query = new URLSearchParams();
    if (options.threadId) query.set('thread_id', options.threadId);
    const suffix = query.size ? `?${query}` : '';
    const response = await fetch(
      `${API}/webhooks/${webhook.id}/${webhook.token}/messages/${messageId}${suffix}`,
      { method: 'DELETE' },
    );
    if (response.status === 404 || response.status === 204) return;
    if (response.status === 429) {
      const detail = await response.json().catch(() => ({}));
      const seconds = Number(detail.retry_after ?? response.headers.get('retry-after') ?? 1);
      await new Promise((resolve) => setTimeout(resolve, Math.max(250, seconds * 1000)));
      continue;
    }
    throw new Error(`Webhook delete ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  throw new Error('Webhook削除の制限から復帰できませんでした。');
}

function sourceParentLocations(manifest) {
  const ids = new Set(manifest.locations.map((item) => item.id));
  return manifest.locations.filter((item) => !item.parentId || !ids.has(item.parentId));
}

function destinationStateEntry(value) {
  if (typeof value === 'string') return { channelId: null, messageIds: [value] };
  return value;
}

async function prepareDestinations(archive, state, destinationValue) {
  if (archive.manifest.source.mode !== 'category') {
    const destination = assertSnowflake(destinationValue ?? args.destination, '移植先チャンネルID');
    for (const location of archive.manifest.locations) state.channels[location.id] = destination;
    return { guildId: null, categoryId: null };
  }
  const categoryId = assertSnowflake(
    destinationValue ?? args['destination-category'],
    '移植先カテゴリID',
  );
  const category = await discord(`/channels/${categoryId}`);
  if (category.type !== 4)
    throw new Error(`${categoryId} は移植先のDiscordカテゴリではありません。`);
  const sourceParents = sourceParentLocations(archive.manifest);
  const destinationChannels = await discord(`/guilds/${category.guild_id}/channels`);
  for (const source of sourceParents) {
    if (state.channels[source.id]) continue;
    const marker = `Meister archive source channel: ${source.id}`;
    const existing = destinationChannels.find(
      (item) => item.parent_id === categoryId && item.topic === marker,
    );
    if (existing) {
      state.channels[source.id] = existing.id;
      continue;
    }
    if (!args.apply) {
      state.channels[source.id] = `(新規作成予定: ${source.name})`;
      continue;
    }
    const created = await discord(`/guilds/${category.guild_id}/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: source.name,
        type: 0,
        parent_id: categoryId,
        topic: marker,
      }),
    });
    state.channels[source.id] = created.id;
    destinationChannels.push(created);
  }
  for (const location of archive.manifest.locations) {
    if (state.channels[location.id]) continue;
    if (location.parentId && state.channels[location.parentId])
      state.channels[location.id] = state.channels[location.parentId];
  }
  return { guildId: category.guild_id, categoryId };
}

function normalizedDiscordName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('ja-JP');
}

function uniqueNamed(items, name, label) {
  const normalized = normalizedDiscordName(name);
  const matches = items.filter((item) => normalizedDiscordName(item.name) === normalized);
  if (matches.length !== 1)
    throw new Error(`${label}「${name}」の候補が${matches.length}件です。1件だけにしてください。`);
  return matches[0];
}

function selectExistingStructureScope(archive) {
  const parentNames = args['include-channel'] ?? [];
  const threadNames = args['include-thread'] ?? [];
  if (!parentNames.length)
    throw new Error('mirror-existing では --include-channel を1件以上指定してください。');
  const locations = archive.manifest.locations;
  const sourceParents = sourceParentLocations(archive.manifest);
  const parents = parentNames.map((name) => uniqueNamed(sourceParents, name, '元チャンネル'));
  const parentIds = new Set(parents.map((item) => item.id));
  const threads = threadNames.map((selector) => {
    const slash = selector.indexOf('/');
    if (slash < 1 || slash === selector.length - 1)
      throw new Error(`--include-thread は PARENT/THREAD 形式です: ${selector}`);
    const parentName = selector.slice(0, slash);
    const threadName = selector.slice(slash + 1);
    const parent = uniqueNamed(parents, parentName, '選択済み元チャンネル');
    return uniqueNamed(
      locations.filter((item) => item.parentId === parent.id && [10, 11, 12].includes(item.type)),
      threadName,
      `元スレッド（${parent.name}）`,
    );
  });
  const locationIds = new Set([...parentIds, ...threads.map((item) => item.id)]);
  const messages = archive.messages.filter(
    (message) => locationIds.has(message.channel_id) && !message.thread && message.type !== 18,
  );
  const messageIds = new Set(messages.map((message) => message.id));
  const attachments = archive.manifest.attachments.filter((item) => messageIds.has(item.messageId));
  return {
    parents,
    threads,
    locations: [...parents, ...threads],
    locationIds,
    messages,
    attachments,
  };
}

async function prepareExistingDestinations(archive, scope, categoryValue) {
  const categoryId = assertSnowflake(categoryValue, '移植先カテゴリID');
  const category = await discord(`/channels/${categoryId}`);
  if (category.type !== 4)
    throw new Error(`${categoryId} は移植先のDiscordカテゴリではありません。`);
  const guildChannels = await discord(`/guilds/${category.guild_id}/channels`);
  const children = guildChannels.filter((item) => item.parent_id === categoryId);
  const channels = {};
  for (const source of scope.parents) {
    const destination = uniqueNamed(children, source.name, '移植先チャンネル');
    const expectedType = [15, 16].includes(source.type) ? source.type : 0;
    if (destination.type !== expectedType)
      throw new Error(
        `移植先「${source.name}」の種類が違います: expected=${expectedType} actual=${destination.type}`,
      );
    channels[source.id] = destination.id;
  }
  const parentDestinationIds = new Set(Object.values(channels));
  const active = await discord(`/guilds/${category.guild_id}/threads/active`);
  const destinationThreads = (active.threads ?? []).filter((item) =>
    parentDestinationIds.has(item.parent_id),
  );
  for (const destinationParentId of parentDestinationIds) {
    const archived = await archivedThreads(destinationParentId, 'public');
    destinationThreads.push(...archived);
  }
  const uniqueThreads = [...new Map(destinationThreads.map((item) => [item.id, item])).values()];
  const threads = {};
  const sourceParents = new Map(scope.parents.map((item) => [item.id, item]));
  for (const source of scope.threads) {
    const sourceParent = sourceParents.get(source.parentId);
    const destinationParentId = channels[source.parentId];
    const destination = uniqueNamed(
      uniqueThreads.filter((item) => item.parent_id === destinationParentId),
      source.name,
      `移植先スレッド（${sourceParent?.name ?? source.parentId}）`,
    );
    threads[source.id] = destination.id;
  }
  return { guildId: category.guild_id, categoryId, channels, threads };
}

function webhookAvatarUrl(message, guildId) {
  const memberAvatar = message.member?.avatar;
  if (memberAvatar && message.author?.id)
    return `https://cdn.discordapp.com/guilds/${guildId}/users/${message.author.id}/avatars/${memberAvatar}.png?size=64`;
  const avatar = message.author?.avatar;
  if (!avatar || !message.author?.id) return null;
  const extension = avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${message.author.id}/${avatar}.${extension}?size=64`;
}

async function mirrorExistingStructure() {
  const archive = await loadArchive(args.archive);
  const verified = await verifyArchiveFiles(archive.root, archive.manifest, archive.messages);
  if (!verified.ok) throw new Error(`移植前検証失敗:\n${verified.errors.join('\n')}`);
  if (archive.manifest.source.mode !== 'category')
    throw new Error('mirror-existing はカテゴリ単位のアーカイブ専用です。');
  const scope = selectExistingStructureScope(archive);
  const prepared = await prepareExistingDestinations(archive, scope, args['destination-category']);
  const maximum = Number(args['max-upload-bytes'] ?? 10 * 1024 * 1024);
  if (!Number.isSafeInteger(maximum) || maximum < 1)
    throw new Error('--max-upload-bytes は正の整数で指定してください。');
  const byMessage = new Map();
  for (const item of scope.attachments) {
    if (!byMessage.has(item.messageId)) byMessage.set(item.messageId, []);
    byMessage.get(item.messageId).push(item);
  }
  const oversized = scope.attachments.filter((item) => item.actualSize > maximum);
  let uploadOverrides = new Map();
  if (oversized.length && args['use-discord-previews-for-oversized-images']) {
    const nonImages = oversized.filter(
      (item) => !(item.responseContentType || item.contentType || '').startsWith('image/'),
    );
    if (nonImages.length)
      throw new Error(
        `画像以外の上限超過が${nonImages.length}件あります。Discordプレビューへ置換できません。`,
      );
    uploadOverrides = await prepareMirrorPreviews(archive, oversized, maximum);
  }
  const unresolvedOversized = oversized.filter((item) => !uploadOverrides.has(item.id));
  if (unresolvedOversized.length)
    throw new Error(
      `未解決の上限超過ファイルが${unresolvedOversized.length}件あります。--use-discord-previews-for-oversized-images を確認してください。`,
    );
  const tooMany = [...byMessage.entries()].filter(([, items]) => items.length > 10);
  if (tooMany.length)
    throw new Error(`1メッセージに添付が11件以上ある記録が${tooMany.length}件あります。`);

  const plan = {
    parentSourceIds: scope.parents.map((item) => item.id).sort(),
    threadSourceIds: scope.threads.map((item) => item.id).sort(),
  };
  const planKey = createHash('sha256').update(JSON.stringify(plan)).digest('hex').slice(0, 12);
  const statePath = path.join(
    archive.root,
    `mirror-existing-${prepared.categoryId}-${planKey}.json`,
  );
  let state = {
    version: 2,
    mode: 'existing-structure',
    destination: prepared.categoryId,
    destinationGuildId: prepared.guildId,
    planKey,
    plan,
    channels: prepared.channels,
    threads: prepared.threads,
    posted: {},
  };
  try {
    const saved = JSON.parse(await readFile(statePath, 'utf8'));
    state = { ...state, ...saved, posted: saved.posted ?? {} };
  } catch {}
  if (state.planKey !== planKey) throw new Error('既存の移植状態と今回の対象範囲が一致しません。');
  for (const [sourceId, destinationId] of Object.entries({
    ...prepared.channels,
    ...prepared.threads,
  })) {
    const saved = state.channels[sourceId] ?? state.threads[sourceId];
    if (saved && saved !== destinationId)
      throw new Error(`移植先構造が途中で変わりました: source=${sourceId}`);
  }
  state.channels = prepared.channels;
  state.threads = prepared.threads;

  const locationNames = new Map(
    archive.manifest.locations.map((location) => [location.id, location.name]),
  );
  console.log(
    `移植予定: ${scope.messages.length}メッセージ / ${scope.attachments.length}添付 / ${scope.parents.length}チャンネル / ${scope.threads.length}スレッド`,
  );
  console.log(
    `再投稿上限: ${maximum} bytes / 原本超過: ${oversized.length}件 / プレビュー置換: ${uploadOverrides.size}件`,
  );
  console.log('既存構造の対応:');
  for (const source of scope.parents)
    console.log(`  #${source.name} -> ${prepared.channels[source.id]}`);
  for (const source of scope.threads)
    console.log(
      `    ${locationNames.get(source.parentId)}/${source.name} -> ${prepared.threads[source.id]}`,
    );
  if (!args.apply) {
    console.log('DRY RUN: Discordには何も投稿していません。');
    return;
  }

  await writeJsonAtomic(statePath, state);
  const webhookPairs = new Map();
  async function webhooksFor(channelId) {
    if (!webhookPairs.has(channelId))
      webhookPairs.set(
        channelId,
        Promise.all([ensureWebhook(channelId, 'A'), ensureWebhook(channelId, 'B')]),
      );
    return webhookPairs.get(channelId);
  }
  const messagesByLocation = new Map(scope.locations.map((location) => [location.id, []]));
  for (const message of scope.messages) messagesByLocation.get(message.channel_id)?.push(message);
  const rendered = new Map();
  for (const location of scope.locations) {
    let previousDate = null;
    for (const message of messagesByLocation.get(location.id) ?? []) {
      const date = discordArchiveDate(message.timestamp);
      rendered.set(
        message.id,
        mirrorMessageBody(message, archive.manifest.source.guildId, date !== previousDate),
      );
      previousDate = date;
    }
  }
  let completed = Object.values(state.posted).filter((item) => item?.complete).length;
  let stateWrite = Promise.resolve();
  function persistState() {
    stateWrite = stateWrite.then(() => writeJsonAtomic(statePath, state));
    return stateWrite;
  }
  const threadByParent = new Map(scope.parents.map((parent) => [parent.id, []]));
  for (const thread of scope.threads) threadByParent.get(thread.parentId)?.push(thread);
  await Promise.all(
    scope.parents.map(async (sourceParent) => {
      const webhookChannelId = prepared.channels[sourceParent.id];
      const pair = await webhooksFor(webhookChannelId);
      const sourceLocations = [sourceParent, ...(threadByParent.get(sourceParent.id) ?? [])];
      for (const sourceLocation of sourceLocations) {
        const destinationChannelId =
          prepared.channels[sourceLocation.id] ?? prepared.threads[sourceLocation.id];
        const threadId = sourceLocation.id === sourceParent.id ? null : destinationChannelId;
        const locationMessages = messagesByLocation.get(sourceLocation.id) ?? [];
        for (let messageIndex = 0; messageIndex < locationMessages.length; messageIndex++) {
          const message = locationMessages[messageIndex];
          let posted = state.posted[message.id];
          if (posted?.complete) continue;
          const attachments = byMessage.get(message.id) ?? [];
          const content = rendered.get(message.id) ?? '';
          const chunks = content
            ? splitDiscordContent(content)
            : [attachments.length ? '' : '（本文なし）'];
          const createdIds = [...(posted?.messageIds ?? [])];
          const webhookSlot = posted?.webhookSlot ?? messageIndex % 2;
          const files = [];
          for (const item of attachments) {
            const uploadItem = uploadOverrides.get(item.id) ?? item;
            const bytes = await readFile(
              path.join(archive.root, ...uploadItem.mediaPath.split('/')),
            );
            files.push({
              blob: new Blob([bytes], {
                type:
                  uploadItem.contentType ||
                  item.responseContentType ||
                  item.contentType ||
                  'application/octet-stream',
              }),
              filename: item.filename,
            });
          }
          for (let chunkIndex = createdIds.length; chunkIndex < chunks.length; chunkIndex++) {
            const author = message.author?.global_name || message.author?.username || '元の投稿者';
            const payload = {
              username: author.slice(0, 80),
              allowed_mentions: { parse: [] },
            };
            if (chunks[chunkIndex]) payload.content = chunks[chunkIndex];
            const avatarUrl = webhookAvatarUrl(message, archive.manifest.source.guildId);
            if (avatarUrl) payload.avatar_url = avatarUrl;
            const created = await executeWebhook(
              pair[webhookSlot],
              payload,
              chunkIndex === 0 && !createdIds.length ? files : [],
              { threadId },
            );
            createdIds.push(created.id);
            state.posted[message.id] = {
              channelId: destinationChannelId,
              webhookChannelId,
              webhookSlot,
              messageIds: createdIds,
              complete: false,
            };
            await persistState();
          }
          state.posted[message.id] = {
            channelId: destinationChannelId,
            webhookChannelId,
            webhookSlot,
            messageIds: createdIds,
            complete: true,
          };
          completed += 1;
          await persistState();
          console.log(`投稿: ${completed}/${scope.messages.length} ${message.id}`);
        }
      }
    }),
  );
  await stateWrite;

  let rewrittenCount = 0;
  for (const message of scope.messages) {
    const posted = state.posted[message.id];
    if (!posted?.complete || !posted.messageIds?.length) continue;
    const original = rendered.get(message.id) ?? '';
    const rewritten = rewriteDiscordMessageLinks(
      original,
      archive.manifest.source.guildId,
      ({ messageId }) => {
        const target = state.posted[messageId];
        if (target?.complete && target.channelId && target.messageIds?.[0])
          return `https://discord.com/channels/${prepared.guildId}/${target.channelId}/${target.messageIds[0]}`;
        const destinationThreadId = prepared.threads[messageId];
        if (destinationThreadId)
          return `https://discord.com/channels/${prepared.guildId}/${destinationThreadId}`;
        return null;
      },
    );
    if (rewritten === original) continue;
    const attachments = byMessage.get(message.id) ?? [];
    const chunks = rewritten
      ? splitDiscordContent(rewritten)
      : [attachments.length ? '' : '（本文なし）'];
    if (chunks.length !== posted.messageIds.length)
      throw new Error(`リンク置換後に分割数が変わりました: source=${message.id}`);
    const pair = await webhooksFor(posted.webhookChannelId);
    const threadId = posted.channelId === posted.webhookChannelId ? null : posted.channelId;
    for (let index = 0; index < chunks.length; index++)
      await editWebhookMessage(pair[posted.webhookSlot], posted.messageIds[index], chunks[index], {
        threadId,
      });
    rewrittenCount += 1;
  }
  console.log(`カテゴリ内リンク・返信先を${rewrittenCount}件張り替えました。`);
  console.log(`完了: ${completed}件を既存構造へ移植しました。対応表: ${statePath}`);
}

async function rollbackExistingStructure() {
  const statePath = path.resolve(args.state ?? '');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  if (state.mode !== 'existing-structure' || state.version !== 2)
    throw new Error('指定ファイルは既存構造移植の状態ファイルではありません。');
  const entries = Object.values(state.posted ?? {}).filter(
    (item) => item?.webhookChannelId && Array.isArray(item.messageIds),
  );
  const messageCount = entries.reduce((sum, item) => sum + item.messageIds.length, 0);
  console.log(
    `巻き戻し予定: ${entries.length}元メッセージ / ${messageCount}Webhook投稿。チャンネルとスレッドは削除しません。`,
  );
  if (!args.apply) {
    console.log('DRY RUN: Discordから何も削除していません。');
    return;
  }
  const pairs = new Map();
  async function webhooksFor(channelId) {
    if (!pairs.has(channelId)) {
      pairs.set(
        channelId,
        Promise.all([ensureWebhook(channelId, 'A'), ensureWebhook(channelId, 'B')]),
      );
    }
    return pairs.get(channelId);
  }
  const groups = new Map();
  for (const item of entries) {
    const key = `${item.webhookChannelId}:${item.webhookSlot}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  let deleted = 0;
  await Promise.all(
    [...groups.values()].map(async (items) => {
      for (const item of items) {
        const pair = await webhooksFor(item.webhookChannelId);
        const threadId = item.channelId === item.webhookChannelId ? null : item.channelId;
        for (const messageId of item.messageIds) {
          await deleteWebhookMessage(pair[item.webhookSlot], messageId, { threadId });
          deleted += 1;
          console.log(`削除: ${deleted}/${messageCount} ${messageId}`);
        }
      }
    }),
  );
  state.posted = {};
  state.rolledBackAt = new Date().toISOString();
  await writeJsonAtomic(statePath, state);
  console.log(`巻き戻し完了: Webhook投稿${deleted}件を削除しました。`);
}

async function verifyExistingStructure() {
  const archive = await loadArchive(args.archive);
  const archiveResult = await verifyArchiveFiles(archive.root, archive.manifest, archive.messages);
  if (!archiveResult.ok)
    throw new Error(`元アーカイブ検証失敗:\n${archiveResult.errors.join('\n')}`);
  const state = JSON.parse(await readFile(path.resolve(args.state ?? ''), 'utf8'));
  if (state.mode !== 'existing-structure' || state.version !== 2)
    throw new Error('指定ファイルは既存構造移植の状態ファイルではありません。');
  const locationIds = new Set([
    ...(state.plan?.parentSourceIds ?? []),
    ...(state.plan?.threadSourceIds ?? []),
  ]);
  const sourceMessages = archive.messages.filter(
    (message) => locationIds.has(message.channel_id) && !message.thread && message.type !== 18,
  );
  const sourceMessageIds = new Set(sourceMessages.map((message) => message.id));
  const sourceAttachments = archive.manifest.attachments.filter((item) =>
    sourceMessageIds.has(item.messageId),
  );
  const webhookPairs = new Map();
  async function webhooksFor(channelId) {
    if (!webhookPairs.has(channelId))
      webhookPairs.set(
        channelId,
        Promise.all([ensureWebhook(channelId, 'A'), ensureWebhook(channelId, 'B')]),
      );
    return webhookPairs.get(channelId);
  }
  const retrievals = Object.values(state.posted ?? {}).flatMap((item) =>
    (item?.messageIds ?? []).map((messageId) => ({ item, messageId })),
  );
  const actualById = new Map();
  const retrievalGroups = new Map();
  for (const retrieval of retrievals) {
    const key = `${retrieval.item.webhookChannelId}:${retrieval.item.webhookSlot}`;
    if (!retrievalGroups.has(key)) retrievalGroups.set(key, []);
    retrievalGroups.get(key).push(retrieval);
  }
  let retrieved = 0;
  await Promise.all(
    [...retrievalGroups.values()].map(async (group) => {
      for (const { item, messageId } of group) {
        const pair = await webhooksFor(item.webhookChannelId);
        const threadId = item.channelId === item.webhookChannelId ? null : item.channelId;
        const message = await getWebhookMessage(pair[item.webhookSlot], messageId, { threadId });
        actualById.set(message.id, { channelId: item.channelId, message });
        retrieved += 1;
        if (retrieved % 250 === 0)
          console.log(`Webhook照合取得: ${retrieved}/${retrievals.length}`);
      }
    }),
  );

  const rendered = new Map();
  const messagesByLocation = new Map([...locationIds].map((locationId) => [locationId, []]));
  for (const message of sourceMessages) messagesByLocation.get(message.channel_id)?.push(message);
  for (const [locationId, messages] of messagesByLocation) {
    let previousDate = null;
    for (const message of messages) {
      const date = discordArchiveDate(message.timestamp);
      const original = mirrorMessageBody(
        message,
        archive.manifest.source.guildId,
        date !== previousDate,
      );
      rendered.set(
        message.id,
        rewriteDiscordMessageLinks(original, archive.manifest.source.guildId, ({ messageId }) => {
          const target = state.posted[messageId];
          if (target?.complete && target.channelId && target.messageIds?.[0])
            return `https://discord.com/channels/${state.destinationGuildId}/${target.channelId}/${target.messageIds[0]}`;
          const destinationThreadId = state.threads?.[messageId];
          return destinationThreadId
            ? `https://discord.com/channels/${state.destinationGuildId}/${destinationThreadId}`
            : null;
        }),
      );
      previousDate = date;
    }
  }

  const errors = [];
  let attachmentCount = 0;
  let dateHeadingCount = 0;
  let remainingSelectedSourceLinks = 0;
  for (const message of sourceMessages) {
    const posted = state.posted?.[message.id];
    if (!posted?.complete) {
      errors.push(`未完了の元メッセージ: ${message.id}`);
      continue;
    }
    const expectedContent = rendered.get(message.id) ?? '';
    const sourceAttachmentCount = sourceAttachments.filter(
      (item) => item.messageId === message.id,
    ).length;
    const expectedChunks = expectedContent
      ? splitDiscordContent(expectedContent)
      : [sourceAttachmentCount ? '' : '（本文なし）'];
    if (expectedChunks.length !== posted.messageIds.length)
      errors.push(`分割数不一致: source=${message.id}`);
    for (let index = 0; index < posted.messageIds.length; index++) {
      const destinationId = posted.messageIds[index];
      const actual = actualById.get(destinationId);
      if (!actual) {
        errors.push(`Discordに投稿がありません: destination=${destinationId}`);
        continue;
      }
      if (actual.channelId !== posted.channelId)
        errors.push(`投稿先不一致: destination=${destinationId}`);
      if (
        normalizeDiscordReturnedContent(actual.message.content) !==
        normalizeDiscordReturnedContent(expectedChunks[index])
      )
        errors.push(`本文不一致: source=${message.id} destination=${destinationId}`);
      attachmentCount += actual.message.attachments?.length ?? 0;
      if (actual.message.content.startsWith('## ')) dateHeadingCount += 1;
      for (const link of discordMessageLinks(actual.message.content))
        if (
          link.guildId === archive.manifest.source.guildId &&
          (state.posted?.[link.messageId] || state.threads?.[link.messageId])
        )
          remainingSelectedSourceLinks += 1;
      if (actual.message.content.includes('【移植記録｜'))
        errors.push(`移植記録表記が残っています: destination=${destinationId}`);
      if (actual.message.content.includes('リアクション:'))
        errors.push(`リアクション表記が残っています: destination=${destinationId}`);
    }
  }
  const unexpectedStateIds = Object.keys(state.posted ?? {}).filter(
    (messageId) => !sourceMessageIds.has(messageId),
  );
  if (unexpectedStateIds.length)
    errors.push(`対象外の状態記録が${unexpectedStateIds.length}件あります。`);
  if (attachmentCount !== sourceAttachments.length)
    errors.push(`添付数不一致: expected=${sourceAttachments.length} actual=${attachmentCount}`);
  if (remainingSelectedSourceLinks)
    errors.push(`張り替え可能なMeisterリンクが${remainingSelectedSourceLinks}件残っています。`);
  console.log(
    `照合: 元${sourceMessages.length}件 / Discord投稿${actualById.size}件 / 添付${attachmentCount}件 / 日付見出し${dateHeadingCount}件`,
  );
  if (errors.length) throw new Error(`移植検証失敗:\n${errors.slice(0, 30).join('\n')}`);
  console.log('OK: 保存先・本文・添付・内部リンクが元アーカイブと一致しました。');
}

async function mirrorArchive() {
  const archive = await loadArchive(args.archive);
  const verified = await verifyArchiveFiles(archive.root, archive.manifest, archive.messages);
  if (!verified.ok) throw new Error(`移植前検証失敗:\n${verified.errors.join('\n')}`);
  const maximum = Number(args['max-upload-bytes'] ?? 10 * 1024 * 1024);
  if (!Number.isSafeInteger(maximum) || maximum < 1)
    throw new Error('--max-upload-bytes は正の整数で指定してください。');
  const byMessage = new Map();
  for (const item of archive.manifest.attachments) {
    if (!byMessage.has(item.messageId)) byMessage.set(item.messageId, []);
    byMessage.get(item.messageId).push(item);
  }
  const oversized = archive.manifest.attachments.filter((item) => item.actualSize > maximum);
  let uploadOverrides = new Map();
  if (oversized.length && args['use-discord-previews-for-oversized-images']) {
    const nonImages = oversized.filter(
      (item) => !(item.responseContentType || item.contentType || '').startsWith('image/'),
    );
    if (nonImages.length)
      throw new Error(
        `画像以外の上限超過が${nonImages.length}件あります。Discordプレビューへ置換できません。`,
      );
    uploadOverrides = await prepareMirrorPreviews(archive, oversized, maximum);
  }
  const unresolvedOversized = oversized.filter((item) => !uploadOverrides.has(item.id));
  const tooMany = [...byMessage.entries()].filter(([, items]) => items.length > 10);
  console.log(
    `移植予定: ${archive.messages.length}メッセージ / ${archive.manifest.attachments.length}添付`,
  );
  console.log(
    `再投稿上限: ${maximum} bytes / 原本超過: ${oversized.length}件 / プレビュー置換: ${uploadOverrides.size}件`,
  );
  if (unresolvedOversized.length) {
    for (const item of unresolvedOversized)
      console.log(`  未解決超過 ${item.actualSize} ${item.filename}`);
    throw new Error(
      '未解決の上限超過ファイルがあります。画像なら --use-discord-previews-for-oversized-images を付けるか、別の保存先を決めてください。',
    );
  }
  if (tooMany.length)
    throw new Error(
      `1メッセージに添付が11件以上ある記録が${tooMany.length}件あります。黙って欠落させず停止しました。`,
    );
  const destinationValue =
    archive.manifest.source.mode === 'category' ? args['destination-category'] : args.destination;
  const destination = assertSnowflake(
    destinationValue,
    archive.manifest.source.mode === 'category' ? '移植先カテゴリID' : '移植先チャンネルID',
  );
  const statePath = path.join(archive.root, `mirror-${destination}.json`);
  let state = { destination, destinationGuildId: null, channels: {}, posted: {} };
  try {
    state = { ...state, ...JSON.parse(await readFile(statePath, 'utf8')) };
  } catch {}
  state.channels ??= {};
  state.posted ??= {};
  const prepared = await prepareDestinations(archive, state, destination);
  state.destinationGuildId = prepared.guildId ?? state.destinationGuildId;
  console.log('チャンネル対応:');
  for (const location of archive.manifest.locations)
    console.log(`  ${location.name} (${location.id}) -> ${state.channels[location.id]}`);
  if (!args.apply) {
    console.log(
      'DRY RUN: Discordには何も投稿していません。内容を確認後、--apply を付けて再実行してください。',
    );
    return;
  }
  await writeJsonAtomic(statePath, state);
  const webhooks = new Map();
  async function webhookFor(channelId) {
    if (!webhooks.has(channelId)) webhooks.set(channelId, await ensureWebhook(channelId));
    return webhooks.get(channelId);
  }
  const locationNames = new Map(
    archive.manifest.locations.map((location) => [location.id, location.name]),
  );
  const previewIds = new Set(uploadOverrides.keys());
  function renderedMessage(message) {
    const locationPrefix =
      archive.manifest.source.mode === 'category'
        ? `【元チャンネル #${locationNames.get(message.channel_id) ?? message.channel_id}】\n`
        : '';
    const previewCount = (message.attachments ?? []).filter((item) =>
      previewIds.has(item.id),
    ).length;
    const previewNote = previewCount
      ? `\n⚠️ 添付${previewCount}件はBatonの10MiB制限のためDiscord生成プレビュー。原本は検証済みアーカイブに保存。`
      : '';
    return `${locationPrefix}${mirrorMessageText(message)}${previewNote}`;
  }
  const messagesByDestination = new Map();
  for (const message of archive.messages) {
    const destinationChannel = state.channels[message.channel_id];
    if (!/^\d+$/.test(destinationChannel ?? ''))
      throw new Error(`移植先チャンネル対応がありません: source=${message.channel_id}`);
    if (!messagesByDestination.has(destinationChannel))
      messagesByDestination.set(destinationChannel, []);
    messagesByDestination.get(destinationChannel).push(message);
  }
  let completed = Object.keys(state.posted).length;
  let stateWrite = Promise.resolve();
  function persistState() {
    stateWrite = stateWrite.then(() => writeJsonAtomic(statePath, state));
    return stateWrite;
  }
  await Promise.all(
    [...messagesByDestination.entries()].map(async ([destinationChannel, messages]) => {
      const webhook = await webhookFor(destinationChannel);
      for (const message of messages) {
        if (state.posted[message.id]) continue;
        const chunks = splitDiscordContent(renderedMessage(message));
        const attachments = byMessage.get(message.id) ?? [];
        const files = [];
        for (const item of attachments) {
          const override = uploadOverrides.get(item.id);
          const uploadItem = override ?? item;
          const bytes = await readFile(path.join(archive.root, ...uploadItem.mediaPath.split('/')));
          files.push({
            blob: new Blob([bytes], {
              type:
                uploadItem.contentType ||
                item.responseContentType ||
                item.contentType ||
                'application/octet-stream',
            }),
            filename: item.filename,
          });
        }
        const author = message.author?.global_name || message.author?.username || 'ペラ日記';
        const createdIds = [];
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          const created = await executeWebhook(
            webhook,
            {
              content: chunks[chunkIndex],
              username: author.slice(0, 80),
              allowed_mentions: { parse: [] },
            },
            chunkIndex === 0 ? files.slice(0, 10) : [],
          );
          createdIds.push(created.id);
        }
        state.posted[message.id] = { channelId: destinationChannel, messageIds: createdIds };
        completed += 1;
        await persistState();
        console.log(`投稿: ${completed}/${archive.messages.length} ${message.id}`);
      }
    }),
  );
  await stateWrite;
  if (state.destinationGuildId) {
    for (const message of archive.messages) {
      const posted = destinationStateEntry(state.posted[message.id]);
      if (!posted?.messageIds?.length || !posted.channelId) continue;
      const original = renderedMessage(message);
      const rewritten = rewriteDiscordMessageLinks(
        original,
        archive.manifest.source.guildId,
        ({ messageId }) => {
          const target = destinationStateEntry(state.posted[messageId]);
          if (!target?.channelId || !target.messageIds?.[0]) return null;
          return `https://discord.com/channels/${state.destinationGuildId}/${target.channelId}/${target.messageIds[0]}`;
        },
      );
      if (rewritten === original) continue;
      const chunks = splitDiscordContent(rewritten);
      if (chunks.length !== posted.messageIds.length)
        throw new Error(`リンク置換後に分割数が変わりました: source=${message.id}`);
      const webhook = await webhookFor(posted.channelId);
      for (let index = 0; index < chunks.length; index++)
        await editWebhookMessage(webhook, posted.messageIds[index], chunks[index]);
    }
    console.log('カテゴリ内メッセージリンクを移植先リンクへ置換しました。');
  }
  console.log(`完了: ${Object.keys(state.posted).length}件を移植しました。対応表: ${statePath}`);
}

try {
  if (command === 'export') await exportArchive();
  else if (command === 'verify') await verifyArchive();
  else if (command === 'mirror') await mirrorArchive();
  else if (command === 'mirror-existing') await mirrorExistingStructure();
  else if (command === 'rollback-existing') await rollbackExistingStructure();
  else if (command === 'verify-existing') await verifyExistingStructure();
  else {
    usage();
    if (command) process.exitCode = 1;
  }
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
}
