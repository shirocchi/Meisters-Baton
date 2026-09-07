import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, unlinkSync, openSync, readSync, closeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { z } from 'zod';
import type { AuthUser, SyncEnvelope, TeamData } from '../src/domain/types.js';
import { analyze, ApiError, generate, openAIProvider, search, type ModelProvider } from './ai.js';
import {
  articleSchema,
  loginSchema,
  recordingSchema,
  registerSchema,
  syncSchema,
  teamDataIssue,
} from './validation.js';

const scrypt = promisify(scryptCallback);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const SESSION_AGE = 30 * 24 * 60 * 60 * 1000;
type UserRow = {
  id: string;
  email: string;
  name: string;
  team_id: string;
  role: 'owner' | 'member';
  password_hash: string;
  team_name: string;
};
type TeamRow = {
  id: string;
  name: string;
  version: number;
  data_json: string;
  invite_hash: string | null;
  invite_expires: number | null;
};
type MediaRow = { id: string; team_id: string; path: string; mime: string; size: number };
type AuthorizedRequest = Request & { auth: AuthUser; tokenHash: string };

export interface AppOptions {
  dataDir?: string;
  apiKey?: string;
  model?: string;
  allowedOrigins?: string[];
  aiProvider?: ModelProvider;
  serveDir?: string;
  now?: () => number;
  sessionAgeMs?: number;
  maxUploadBytes?: number;
  aiRequestsPerHour?: number;
  trustProxy?: boolean | number;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      400,
      '入力を確認してください。' +
        result.error.issues
          .slice(0, 3)
          .map((i) => ` ${i.path.join('.')}: ${i.message}`)
          .join(''),
      'INVALID_INPUT',
    );
  return result.data;
}
function userView(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    teamId: row.team_id,
    teamName: row.team_name,
    role: row.role,
  };
}
function emptyData(teamId: string, name: string): TeamData {
  return {
    schemaVersion: 1,
    workspace: { id: teamId, name },
    recordings: [],
    articles: [],
    requests: [],
    activity: [],
  };
}
async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString('hex')}`;
}
async function passwordMatches(password: string, encoded: string): Promise<boolean> {
  const [, salt, expectedHex] = encoded.split(':');
  if (!salt || !expectedHex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Request body media types are not trusted: check the container/file signature too. */
function validFileSignature(path: string, mime: string): boolean {
  const buffer = Buffer.alloc(64);
  const handle = openSync(path, 'r');
  let length: number;
  try {
    length = readSync(handle, buffer, 0, buffer.length, 0);
  } finally {
    closeSync(handle);
  }
  const bytes = buffer.subarray(0, length);
  if (['video/mp4', 'video/quicktime', 'audio/mp4', 'audio/x-m4a'].includes(mime))
    return bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp';
  if (['video/webm', 'audio/webm'].includes(mime))
    return bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (mime === 'image/png')
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/webp')
    return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (['audio/wav', 'audio/x-wav'].includes(mime))
    return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE';
  if (mime === 'audio/mpeg')
    return (
      bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    );
  if (mime === 'audio/ogg' || mime === 'video/ogg') return bytes.toString('ascii', 0, 4) === 'OggS';
  return false;
}

export function createApp(options: AppOptions = {}) {
  const dataDir = resolve(options.dataDir ?? process.env.DATA_DIR ?? './.data');
  const mediaDir = join(dataDir, 'media');
  mkdirSync(mediaDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'baton.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, data_json TEXT NOT NULL, invite_hash TEXT UNIQUE, invite_expires INTEGER);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, team_id TEXT NOT NULL REFERENCES teams(id), role TEXT NOT NULL CHECK(role IN ('owner','member')), created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE, path TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS ai_usage (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, window_start INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (user_id,window_start));
    CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS media_team ON media(team_id);`);
  const now = options.now ?? Date.now;
  const model = options.model ?? process.env.OPENAI_MODEL ?? 'gpt-6-astra';
  const key = options.apiKey ?? process.env.OPENAI_API_KEY;
  const provider = options.aiProvider ?? (key?.trim() ? openAIProvider(key, model) : undefined);
  const origins =
    options.allowedOrigins ??
    (
      process.env.ALLOWED_ORIGINS ??
      'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,capacitor://localhost,http://localhost,https://localhost'
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  if (origins.includes('*'))
    throw new Error('ALLOWED_ORIGINS must use explicit origins; wildcard is not permitted.');
  const app = express();
  app.disable('x-powered-by');
  if (options.trustProxy !== undefined) app.set('trust proxy', options.trustProxy);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  // Scope CORS to private API requests. Adding Vary: Origin to the static shell
  // breaks reuse of precached CSS/modules during an offline browser reload.
  app.use(
    '/api',
    cors({
      origin: (origin, callback) => {
        if (!origin || origins.includes(origin)) callback(null, true);
        else callback(new ApiError(403, 'この接続元は許可されていません。', 'ORIGIN_DENIED'));
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '12mb', strict: true }));

  const rateBuckets = new Map<string, { start: number; count: number }>();
  const rateLimit =
    (scope: string, maximum: number, windowMs: number) =>
    (req: Request, res: Response, next: NextFunction) => {
      const key = `${scope}:${req.ip ?? 'unknown'}`;
      const timestamp = now();
      if (rateBuckets.size > 10_000)
        for (const [id, bucket] of rateBuckets)
          if (timestamp - bucket.start > windowMs) rateBuckets.delete(id);
      const current = rateBuckets.get(key);
      if (!current || timestamp - current.start >= windowMs)
        rateBuckets.set(key, { start: timestamp, count: 1 });
      else if (++current.count > maximum) {
        res.setHeader(
          'Retry-After',
          String(Math.ceil((windowMs - timestamp + current.start) / 1000)),
        );
        next(new ApiError(429, '操作が多すぎます。少し待ってお試しください。', 'RATE_LIMITED'));
        return;
      }
      next();
    };
  const userById = (id: string) =>
    db
      .prepare(
        'SELECT users.*, teams.name AS team_name FROM users JOIN teams ON users.team_id=teams.id WHERE users.id=?',
      )
      .get(id) as UserRow | undefined;
  const teamById = (id: string) => db.prepare('SELECT * FROM teams WHERE id=?').get(id) as TeamRow;
  const envelope = (team: TeamRow): SyncEnvelope => ({
    version: team.version,
    data: JSON.parse(team.data_json) as TeamData,
  });
  const createSession = (user: UserRow) => {
    const token = randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now());
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(
      hash(token),
      user.id,
      now() + (options.sessionAgeMs ?? SESSION_AGE),
    );
    return { token, user: userView(user) };
  };
  const auth = (req: Request, _res: Response, next: NextFunction) => {
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get('Authorization') ?? '')?.[1];
    if (!token) {
      next(new ApiError(401, 'ログインが必要です。', 'UNAUTHORIZED'));
      return;
    }
    const tokenHash = hash(token);
    const session = db
      .prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?')
      .get(tokenHash, now()) as { user_id: string } | undefined;
    const user = session && userById(session.user_id);
    if (!user) {
      next(new ApiError(401, 'ログインの有効期限が切れています。', 'UNAUTHORIZED'));
      return;
    }
    (req as AuthorizedRequest).auth = userView(user);
    (req as AuthorizedRequest).tokenHash = tokenHash;
    next();
  };
  const authorized = (req: Request) => (req as AuthorizedRequest).auth;
  const requireOwner = (req: Request) => {
    if (authorized(req).role !== 'owner')
      throw new ApiError(403, 'チーム管理者のみ操作できます。', 'OWNER_REQUIRED');
  };
  const transaction = <T>(callback: () => T): T => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };

  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, aiConfigured: Boolean(provider), model }),
  );
  app.post('/api/auth/register', rateLimit('auth', 12, 60_000), async (req, res) => {
    const body = parse(registerSchema, req.body);
    const encoded = await passwordHash(body.password);
    const userId = randomUUID();
    const teamId = randomUUID();
    transaction(() => {
      if (db.prepare('SELECT id FROM users WHERE email=?').get(body.email))
        throw new ApiError(
          409,
          'このメールアドレスは登録済みです。ログインしてください。',
          'EMAIL_EXISTS',
        );
      db.prepare('INSERT INTO teams(id,name,data_json) VALUES(?,?,?)').run(
        teamId,
        body.teamName,
        JSON.stringify(emptyData(teamId, body.teamName)),
      );
      db.prepare(
        'INSERT INTO users(id,email,name,password_hash,team_id,role,created_at) VALUES(?,?,?,?,?,?,?)',
      ).run(userId, body.email, body.name, encoded, teamId, 'owner', now());
    });
    res.status(201).json(createSession(userById(userId)!));
  });
  app.post('/api/auth/login', rateLimit('auth', 12, 60_000), async (req, res) => {
    const body = parse(loginSchema, req.body);
    const user = db
      .prepare(
        'SELECT users.*, teams.name AS team_name FROM users JOIN teams ON users.team_id=teams.id WHERE email=?',
      )
      .get(body.email) as UserRow | undefined;
    // The dummy hash makes unknown-account requests perform the same costly password derivation.
    const encoded =
      user?.password_hash ?? `scrypt:00000000000000000000000000000000:${'0'.repeat(128)}`;
    if (!(await passwordMatches(body.password, encoded)) || !user)
      throw new ApiError(401, 'メールアドレスまたはパスワードが違います。', 'INVALID_CREDENTIALS');
    res.json(createSession(user));
  });
  app.use('/api', auth);
  app.get('/api/auth/me', (req, res) => res.json(authorized(req)));
  app.post('/api/auth/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run((req as AuthorizedRequest).tokenHash);
    res.json({ ok: true });
  });
  app.delete('/api/auth/account', rateLimit('account', 5, 60_000), async (req, res) => {
    const { password } = parse(
      z.object({ password: z.string().min(1).max(128) }).strict(),
      req.body,
    );
    const user = authorized(req);
    const row = userById(user.id)!;
    if (!(await passwordMatches(password, row.password_hash)))
      throw new ApiError(401, '現在のパスワードが違います。', 'INVALID_CREDENTIALS');
    const remaining = db
      .prepare('SELECT id FROM users WHERE team_id=? AND id<>? ORDER BY created_at,id')
      .all(user.teamId, user.id) as { id: string }[];
    const paths = remaining.length
      ? []
      : (
          db.prepare('SELECT path FROM media WHERE team_id=?').all(user.teamId) as {
            path: string;
          }[]
        ).map((m) => m.path);
    transaction(() => {
      db.prepare('DELETE FROM users WHERE id=?').run(user.id);
      if (remaining.length && user.role === 'owner') {
        db.prepare("UPDATE users SET role='owner' WHERE id=?").run(remaining[0].id);
        db.prepare('UPDATE teams SET invite_hash=NULL,invite_expires=NULL WHERE id=?').run(
          user.teamId,
        );
      }
      if (!remaining.length) db.prepare('DELETE FROM teams WHERE id=?').run(user.teamId);
    });
    for (const file of paths)
      if (existsSync(join(mediaDir, file))) unlinkSync(join(mediaDir, file));
    res.json({ ok: true });
  });

  app.get('/api/team/invite', (req, res) => {
    requireOwner(req);
    const team = teamById(authorized(req).teamId);
    res.json({
      code: null,
      expiresAt:
        team.invite_expires && team.invite_expires > now()
          ? new Date(team.invite_expires).toISOString()
          : null,
    });
  });
  app.post('/api/team/invite', rateLimit('invite', 10, 60_000), (req, res) => {
    requireOwner(req);
    const code = randomBytes(10).toString('hex').toUpperCase();
    const expires = now() + 7 * 24 * 60 * 60 * 1000;
    db.prepare('UPDATE teams SET invite_hash=?,invite_expires=? WHERE id=?').run(
      hash(code),
      expires,
      authorized(req).teamId,
    );
    res.json({ code, expiresAt: new Date(expires).toISOString() });
  });
  app.post('/api/team/join', rateLimit('join', 10, 60_000), (req, res) => {
    const { code } = parse(
      z
        .object({
          code: z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^[A-F0-9]{20}$/),
        })
        .strict(),
      req.body,
    );
    const user = authorized(req);
    const target = db
      .prepare('SELECT * FROM teams WHERE invite_hash=? AND invite_expires>?')
      .get(hash(code), now()) as TeamRow | undefined;
    if (!target)
      throw new ApiError(
        404,
        '招待コードが見つからないか、有効期限が切れています。',
        'INVITE_NOT_FOUND',
      );
    if (target.id === user.teamId) {
      res.json(user);
      return;
    }
    const current = teamById(user.teamId);
    const currentData = envelope(current).data;
    const others = db
      .prepare('SELECT COUNT(*) AS count FROM users WHERE team_id=? AND id<>?')
      .get(user.teamId, user.id) as { count: number };
    const mediaCount = db
      .prepare('SELECT COUNT(*) AS count FROM media WHERE team_id=?')
      .get(user.teamId) as { count: number };
    if (
      user.role === 'owner' &&
      (others.count ||
        currentData.recordings.length ||
        currentData.articles.length ||
        currentData.requests.length ||
        currentData.activity.length ||
        mediaCount.count)
    )
      throw new ApiError(
        409,
        '現在のチームに共有データまたはメンバーがいます。空の新規アカウントで参加してください。',
        'TEAM_NOT_EMPTY',
      );
    transaction(() => {
      db.prepare("UPDATE users SET team_id=?,role='member' WHERE id=?").run(target.id, user.id);
      // Revoke all other sessions so a team switch cannot leave an old device writing into the new team accidentally.
      db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(
        user.id,
        (req as AuthorizedRequest).tokenHash,
      );
      if (user.role === 'owner') db.prepare('DELETE FROM teams WHERE id=?').run(user.teamId);
    });
    res.json(userView(userById(user.id)!));
  });

  app.get('/api/sync', (req, res) => res.json(envelope(teamById(authorized(req).teamId))));
  app.put('/api/sync', (req, res) => {
    const body = parse(syncSchema, req.body);
    const user = authorized(req);
    const issue = teamDataIssue(body.data);
    if (issue) throw new ApiError(400, issue, 'INVALID_TEAM_DATA');
    for (const recording of body.data.recordings)
      if (
        recording.remoteMediaId &&
        !db
          .prepare('SELECT id FROM media WHERE id=? AND team_id=?')
          .get(recording.remoteMediaId, user.teamId)
      )
        throw new ApiError(
          400,
          '動画が現在のチームにありません。先に動画をアップロードしてください。',
          'MEDIA_NOT_FOUND',
        );
    const data: TeamData = { ...body.data, workspace: { id: user.teamId, name: user.teamName } };
    const result = db
      .prepare('UPDATE teams SET data_json=?,version=version+1 WHERE id=? AND version=?')
      .run(JSON.stringify(data), user.teamId, body.version);
    if (!result.changes) {
      res.status(409).json({
        error: '別の端末で更新されています。最新データを取得してから差分を確認してください。',
        code: 'SYNC_CONFLICT',
        currentVersion: teamById(user.teamId).version,
      });
      return;
    }
    res.json(envelope(teamById(user.teamId)));
  });

  const allowedMimes = new Set([
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/ogg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/webm',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'image/png',
    'image/jpeg',
    'image/webp',
  ]);
  const upload = multer({
    storage: multer.diskStorage({
      destination: mediaDir,
      filename: (_req, _file, callback) => callback(null, randomUUID()),
    }),
    limits: {
      fileSize: options.maxUploadBytes ?? 100 * 1024 * 1024,
      files: 1,
      fields: 0,
      parts: 2,
      fieldNameSize: 100,
    },
    fileFilter: (_req, file, callback) =>
      allowedMimes.has(file.mimetype)
        ? callback(null, true)
        : callback(
            new ApiError(
              415,
              '対応する動画・音声・画像ファイルを選んでください。',
              'UNSUPPORTED_MEDIA',
            ),
          ),
  });
  app.post('/api/media', rateLimit('upload', 20, 60_000), upload.single('file'), (req, res) => {
    if (!req.file) throw new ApiError(400, 'ファイルを選んでください。', 'FILE_REQUIRED');
    try {
      if (!validFileSignature(req.file.path, req.file.mimetype))
        throw new ApiError(415, 'ファイルの実際の形式が指定形式と一致しません。', 'INVALID_MEDIA');
      const user = authorized(req);
      const used = db
        .prepare('SELECT COALESCE(SUM(size),0) AS bytes FROM media WHERE team_id=?')
        .get(user.teamId) as { bytes: number };
      if (used.bytes + req.file.size > 1024 * 1024 * 1024)
        throw new ApiError(413, 'チームの動画保存上限（1GB）に達しています。', 'STORAGE_LIMIT');
      db.prepare('INSERT INTO media(id,team_id,path,mime,size,created_at) VALUES(?,?,?,?,?,?)').run(
        req.file.filename,
        user.teamId,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        now(),
      );
      res.status(201).json({ id: req.file.filename });
    } catch (error) {
      if (existsSync(req.file.path)) unlinkSync(req.file.path);
      throw error;
    }
  });
  app.get('/api/media/:id', (req, res) => {
    const mediaId = parse(z.string().uuid(), req.params.id);
    const user = authorized(req);
    const media = db
      .prepare('SELECT * FROM media WHERE id=? AND team_id=?')
      .get(mediaId, user.teamId) as MediaRow | undefined;
    if (!media || !existsSync(join(mediaDir, media.path)))
      throw new ApiError(404, '動画が見つかりません。', 'MEDIA_NOT_FOUND');
    res.type(media.mime);
    res.setHeader('Content-Disposition', `inline; filename="${media.id}"`);
    res.sendFile(join(mediaDir, media.path), { cacheControl: false, lastModified: false });
  });
  app.delete('/api/media/:id', (req, res) => {
    const mediaId = parse(z.string().uuid(), req.params.id);
    const user = authorized(req);
    const media = db
      .prepare('SELECT * FROM media WHERE id=? AND team_id=?')
      .get(mediaId, user.teamId) as MediaRow | undefined;
    if (!media) throw new ApiError(404, '動画が見つかりません。', 'MEDIA_NOT_FOUND');
    if (envelope(teamById(user.teamId)).data.recordings.some((r) => r.remoteMediaId === mediaId))
      throw new ApiError(
        409,
        '記録から参照されている動画は削除できません。先に記録を更新してください。',
        'MEDIA_IN_USE',
      );
    db.prepare('DELETE FROM media WHERE id=?').run(mediaId);
    if (existsSync(join(mediaDir, media.path))) unlinkSync(join(mediaDir, media.path));
    res.json({ ok: true });
  });

  app.use('/api/ai', (req, _res, next) => {
    if (!provider) {
      next(
        new ApiError(
          503,
          'AIは未設定です。設定済みのサーバーに接続するか、熟練者への質問を手動で続けてください。',
          'AI_NOT_CONFIGURED',
        ),
      );
      return;
    }
    const user = authorized(req);
    const window = Math.floor(now() / 3_600_000) * 3_600_000;
    db.prepare('DELETE FROM ai_usage WHERE window_start<?').run(window - 3_600_000);
    const usage = db
      .prepare('SELECT count FROM ai_usage WHERE user_id=? AND window_start=?')
      .get(user.id, window) as { count: number } | undefined;
    if ((usage?.count ?? 0) >= (options.aiRequestsPerHour ?? 12)) {
      next(
        new ApiError(
          429,
          '1時間のAI利用上限に達しています。次の時間帯にお試しください。',
          'AI_USER_LIMIT',
        ),
      );
      return;
    }
    db.prepare(
      'INSERT INTO ai_usage(user_id,window_start,count) VALUES(?,?,1) ON CONFLICT(user_id,window_start) DO UPDATE SET count=count+1',
    ).run(user.id, window);
    next();
  });
  app.post('/api/ai/analyze', async (req, res) => {
    const { recording, context } = parse(
      z
        .object({ recording: recordingSchema, context: z.array(articleSchema).max(20).default([]) })
        .strict(),
      req.body,
    );
    res.json(await analyze(provider!, recording, context));
  });
  app.post('/api/ai/generate', async (req, res) => {
    const { recording } = parse(z.object({ recording: recordingSchema }).strict(), req.body);
    res.json(await generate(provider!, recording));
  });
  app.post('/api/ai/search', async (req, res) => {
    const { query } = parse(
      z.object({ query: z.string().trim().min(1).max(1000) }).strict(),
      req.body,
    );
    const team = envelope(teamById(authorized(req).teamId));
    res.json(await search(provider!, query, team.data.articles));
  });

  app.use('/api', (_req, _res, next) =>
    next(new ApiError(404, 'APIが見つかりません。', 'NOT_FOUND')),
  );
  const serveDir = options.serveDir && resolve(options.serveDir);
  if (serveDir && existsSync(join(serveDir, 'index.html'))) {
    app.use(express.static(serveDir, { index: false, dotfiles: 'deny', maxAge: 3600_000 }));
    app.get('/{*path}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(serveDir, 'index.html'));
    });
  }
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: error.message, code: error.code });
      return;
    }
    if (error instanceof multer.MulterError) {
      res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
        error:
          error.code === 'LIMIT_FILE_SIZE'
            ? 'ファイルは100MB以内にしてください。'
            : 'ファイルの送信形式が正しくありません。',
        code: error.code,
      });
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ error: 'JSONの形式が正しくありません。', code: 'INVALID_JSON' });
      return;
    }
    if (
      typeof error === 'object' &&
      error &&
      'type' in error &&
      error.type === 'entity.too.large'
    ) {
      res.status(413).json({
        error: 'データ容量が大きすぎます。1回の同期は12MBまでです。',
        code: 'BODY_TOO_LARGE',
      });
      return;
    }
    // Never echo provider errors, SQL, input payloads or secrets to clients.
    console.error(
      '[baton api] unexpected request failure',
      error instanceof Error ? error.name : 'UnknownError',
    );
    res.status(500).json({
      error: 'サーバーで問題が発生しました。データを保管したまま再試行してください。',
      code: 'INTERNAL_ERROR',
    });
  });
  return { app, close: () => db.close(), db };
}
