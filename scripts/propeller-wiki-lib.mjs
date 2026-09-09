import { z } from 'zod';

const specifications = z
  .array(
    z.object({
      slug: z.string().regex(/^[a-z0-9-]+$/),
      title: z.string().min(1),
      category: z.string().min(1),
      summary: z.string(),
      tags: z.array(z.string()),
      claims: z
        .array(
          z.object({
            kind: z.enum(['step', 'judgment', 'warning']),
            title: z.string().min(1),
            body: z.string().min(1),
            sources: z.array(z.string().regex(/^[0-9]+$/)).min(1),
          }),
        )
        .min(1),
    }),
  )
  .min(1);

export function requiredSourceMessageIds(articleSpecs) {
  return [
    ...new Set(articleSpecs.flatMap((article) => article.claims.flatMap((claim) => claim.sources))),
  ];
}

export function buildPropellerWikiBackup(manifest, messages, privateSpecifications) {
  const articleSpecs = specifications.parse(privateSpecifications);
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const locations = new Map(manifest.locations.map((location) => [location.id, location]));
  const attachmentsByMessage = new Map();
  for (const attachment of manifest.attachments) {
    const current = attachmentsByMessage.get(attachment.messageId) ?? [];
    current.push(attachment);
    attachmentsByMessage.set(attachment.messageId, current);
  }
  const missing = requiredSourceMessageIds(articleSpecs).filter(
    (id) => !messagesById.get(id)?.content?.trim(),
  );
  if (missing.length) throw new Error(`Wiki根拠メッセージが見つかりません: ${missing.join(', ')}`);
  const generatedAt = manifest.exportedAt || '2026-09-08T00:00:00.000Z';
  const guildId = manifest.source.guildId;
  const recordings = [];
  const articles = [];

  for (const spec of articleSpecs) {
    const sourceIds = [...new Set(spec.claims.flatMap((claim) => claim.sources))];
    const sourceMessages = sourceIds.map((id) => messagesById.get(id));
    const recordingId = `discord_recording_${spec.slug}`;
    const dates = sourceMessages.map((message) => message.timestamp).sort();
    const notes = sourceMessages
      .map((message) => {
        const location = locations.get(message.channel_id);
        const parent = locations.get(location?.parentId);
        const label = `${parent ? `${parent.name} / ` : ''}${location?.name ?? message.channel_id}`;
        const author = message.author?.global_name || message.author?.username || '名前不明';
        return `[${message.timestamp}] ${label} / ${author}\n${message.content}`;
      })
      .join('\n\n---\n\n');
    recordings.push({
      id: recordingId,
      title: `Discord一次資料：${spec.title}`,
      category: spec.category,
      author: 'Meister Discord（複数投稿者）',
      createdAt: dates[0],
      updatedAt: dates.at(-1),
      duration: 0,
      frames: [],
      notes,
      answers: [],
      status: 'draft',
      isDemo: false,
    });
    articles.push({
      id: `discord_article_${spec.slug}`,
      recordingId,
      title: spec.title,
      category: spec.category,
      summary: spec.summary,
      tags: spec.tags,
      claims: spec.claims.map((claim, claimIndex) => ({
        id: `discord_claim_${spec.slug}_${claimIndex + 1}`,
        kind: claim.kind,
        title: claim.title,
        body: claim.body,
        evidence: claim.sources.map((messageId, evidenceIndex) => {
          const message = messagesById.get(messageId);
          const location = locations.get(message.channel_id);
          const parent = locations.get(location?.parentId);
          const attachments = attachmentsByMessage.get(messageId) ?? [];
          return {
            id: `discord_evidence_${spec.slug}_${claimIndex + 1}_${evidenceIndex + 1}`,
            kind: 'note',
            recordingId,
            quote: message.content,
            sourceLabel: `${parent ? `${parent.name} / ` : ''}${location?.name ?? message.channel_id} · ${message.timestamp.slice(0, 10)}`,
            sourceUrl: `https://discord.com/channels/${guildId}/${message.channel_id}/${message.id}`,
            sourceAttachments: attachments.map((attachment) => ({
              filename: attachment.filename,
              mediaPath: attachment.mediaPath,
              contentType:
                attachment.responseContentType ||
                attachment.contentType ||
                'application/octet-stream',
              bytes: attachment.actualSize,
              sha256: attachment.sha256,
            })),
          };
        }),
        review: 'draft',
      })),
      author: 'Discordアーカイブから仮整理',
      createdAt: generatedAt,
      updatedAt: generatedAt,
      status: 'draft',
      isDemo: false,
      revisions: [],
      bookmarked: false,
    });
  }

  return {
    format: 'meisters-baton-backup',
    version: 1,
    exportedAt: generatedAt,
    mediaIncluded: false,
    notice:
      'Discord一次資料から仮整理したWiki下書きです。添付本体はOneDrive共有アーカイブにあり、このJSONには含まれません。各項目を原文と現行手順に照らして確認してください。',
    sourceArchive: {
      format: manifest.format,
      version: manifest.version,
      guildId,
      categoryId: manifest.source.categoryId,
      exportedAt: manifest.exportedAt,
      messageCount: manifest.stats.messageCount,
      attachmentCount: manifest.stats.attachmentCount,
    },
    data: {
      schemaVersion: 1,
      workspace: { id: 'workspace_propeller_discord', name: '26代プロペラ班' },
      recordings,
      articles,
      requests: [
        {
          id: 'discord_request_mould_conditions',
          text: 'サフ・ゲルコート・大積層の材料、配合、待ち時間、合否基準を現行手順から確認したい。',
          category: '型製作',
          createdAt: generatedAt,
          status: 'open',
        },
        {
          id: 'discord_request_vacuum_check',
          text: '真空引きの漏れ確認手順と、ブチル・バッグ・配管を切り分ける基準を経験者に確認したい。',
          category: '複合材・外皮',
          createdAt: generatedAt,
          status: 'open',
        },
        {
          id: 'discord_request_rotation_safety',
          text: '回転試験前の締結トルク、二者確認、立入範囲、試験中止基準を安全責任者に確認したい。',
          category: '安全・試験',
          createdAt: generatedAt,
          status: 'open',
        },
      ],
      activity: [],
    },
  };
}
