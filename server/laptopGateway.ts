import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { z } from 'zod';
import { resolve } from 'node:path';
import { analyze, generate, search, ApiError, type ModelProvider } from './ai';
import { articleSchema, recordingSchema } from './validation';
import { createReader } from './wikiContext';
import { processVideoHandler } from './processVideo';

export function createLaptopGateway(options: {
  url: string;
  key: string;
  teamId: string;
  provider: ModelProvider;
  allowedOrigins: string[];
  serveDir?: string;
  fetcher?: typeof fetch;
}) {
  if (!z.string().uuid().safeParse(options.teamId).success)
    throw Error('BATON_ALLOWED_TEAM_IDに利用する工房IDを設定してください。');
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    // Loopback binding alone does not prevent DNS rebinding or unrelated web origins.
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname))
      return res.status(403).json({ error: '接続先が許可されていません。' });
    const origin = req.get('origin');
    if (origin && !options.allowedOrigins.includes(origin))
      return res.status(403).json({ error: 'この画面からの接続は許可されていません。' });
    next();
  });
  app.use(
    cors({
      origin: options.allowedOrigins,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Baton-Team'],
    }),
  );
  app.use(express.json({ limit: '10mb' }));
  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, aiConfigured: true, provider: 'codex-chatgpt', scope: 'loopback' }),
  );
  app.post(
    '/api/process-video',
    (req, _res, next) => {
      if (req.body?.teamId !== options.teamId)
        return next(
          new ApiError(403, 'このPCで利用できる工房ではありません。', 'TEAM_NOT_ALLOWED'),
        );
      next();
    },
    processVideoHandler(options),
  );
  const usage = new Map<string, { hour: number; count: number }>();
  const endpoints = ['analyze', 'generate', 'search'] as const;
  for (const action of endpoints)
    app.post(`/api/ai/${action}`, async (req, res) => {
      const token = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(req.get('authorization') ?? '')?.[1];
      if (!token) throw new ApiError(401, 'アプリへのログインが必要です。', 'UNAUTHORIZED');
      if (req.get('X-Baton-Team') !== options.teamId)
        throw new ApiError(403, 'このPCで利用できる工房ではありません。', 'TEAM_NOT_ALLOWED');
      let data;
      try {
        data = await createReader(options.url, options.key, token, options.fetcher).load(
          options.teamId,
        );
      } catch {
        throw new ApiError(
          403,
          'ログイン・工房の所属・Wiki閲覧権限を確認してください。',
          'WIKI_ACCESS_DENIED',
        );
      }
      if (!data.userId) throw new ApiError(403, '利用者を確認できません。', 'UNAUTHORIZED');
      const hour = Math.floor(Date.now() / 3600000);
      for (const [id, value] of usage) if (value.hour !== hour) usage.delete(id);
      const current = usage.get(data.userId);
      if ((current?.count ?? 0) >= 12)
        throw new ApiError(429, '1時間のAI利用上限に達しました。', 'AI_USER_LIMIT');
      const schema =
        action === 'analyze'
          ? z
              .object({
                recording: recordingSchema,
                context: z.array(articleSchema).max(20).default([]),
              })
              .strict()
          : action === 'generate'
            ? z.object({ recording: recordingSchema }).strict()
            : z.object({ query: z.string().trim().min(1).max(1000) }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) throw new ApiError(400, '入力を確認してください。', 'INVALID_INPUT');
      usage.set(data.userId, { hour, count: (current?.count ?? 0) + 1 });
      const input = parsed.data;
      if (action === 'search' && 'query' in input)
        res.json(await search(options.provider, input.query, data.team?.articles ?? []));
      else if (action === 'analyze' && 'recording' in input)
        res.json(
          await analyze(
            options.provider,
            input.recording,
            'context' in input ? z.array(articleSchema).parse(input.context) : [],
          ),
        );
      else if ('recording' in input) res.json(await generate(options.provider, input.recording));
    });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'APIが見つかりません。' }));
  if (options.serveDir) {
    const root = resolve(options.serveDir);
    app.use(express.static(root, { dotfiles: 'deny', index: false }));
    app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root }));
  }
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    res.status(error instanceof ApiError ? error.status : 500).json({
      error: error instanceof ApiError ? error.message : '処理に失敗しました。記録は残っています。',
      code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
    });
  };
  app.use(errors);
  return app;
}
