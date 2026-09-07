import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Settings, TeamData } from '../domain/types';
import { makeId } from '../domain/core';
import { parseTeamData } from '../domain/validation';

interface BatonDatabase extends DBSchema {
  state: { key: 'teamData' | 'settings'; value: TeamData | Settings };
  media: { key: string; value: Blob };
  answerDrafts: { key: string; value: string };
}

export const defaultSettings: Settings = {
  displayName: '',
  apiBaseUrl: '',
  demoVisible: true,
  onboardingDone: false,
  aiConsent: false,
};
export const BACKUP_NOTICE =
  '動画本体とフレーム画像は含まれません。動画への参照は来歴として残りますが、元動画を保存した端末以外では再生できない場合があります。';
let database: Promise<IDBPDatabase<BatonDatabase>> | undefined;

function getDatabase() {
  if (!database) {
    database = openDB<BatonDatabase>('meisters-baton-beta', 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
        if (!db.objectStoreNames.contains('media')) db.createObjectStore('media');
        if (!db.objectStoreNames.contains('answerDrafts')) db.createObjectStore('answerDrafts');
      },
      blocking() {
        database?.then((db) => db.close());
        database = undefined;
      },
      terminated() {
        database = undefined;
      },
    }).catch((error) => {
      database = undefined;
      throw error;
    });
  }
  return database;
}

export async function loadData(): Promise<TeamData | null> {
  const db = await getDatabase();
  const value = await db.get('state', 'teamData');
  return value === undefined ? null : parseTeamData(value);
}

export async function saveData(data: TeamData): Promise<void> {
  const valid = parseTeamData(data);
  const db = await getDatabase();
  await db.put('state', valid, 'teamData');
}

function parseSettings(value: unknown): Settings {
  const result = { ...defaultSettings };
  if (!value || typeof value !== 'object') return result;
  const settings = value as Record<string, unknown>;
  if (typeof settings.displayName === 'string')
    result.displayName = settings.displayName.slice(0, 200);
  if (typeof settings.apiBaseUrl === 'string')
    result.apiBaseUrl = settings.apiBaseUrl.slice(0, 2000);
  for (const key of ['demoVisible', 'onboardingDone', 'aiConsent'] as const)
    if (typeof settings[key] === 'boolean') result[key] = settings[key];
  return result;
}

export async function loadSettings(): Promise<Settings> {
  const db = await getDatabase();
  return parseSettings(await db.get('state', 'settings'));
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDatabase();
  await db.put('state', parseSettings(settings), 'settings');
}

export async function putMedia(blob: Blob, id = makeId('media')): Promise<string> {
  if (!(blob instanceof Blob) || !blob.size) throw new Error('動画ファイルが空です。');
  if (blob.size > 500 * 1024 * 1024) throw new Error('動画は500MB以内で保存してください。');
  if (!blob.type.startsWith('video/')) throw new Error('動画形式のファイルを選んでください。');
  const db = await getDatabase();
  const tx = db.transaction('media', 'readwrite');
  if (await tx.store.getKey(id)) {
    tx.abort();
    await tx.done.catch(() => undefined);
    throw new Error('同じIDの動画がすでに保存されています。');
  }
  await tx.store.add(blob, id);
  await tx.done;
  return id;
}

export async function getMedia(id: string): Promise<Blob | undefined> {
  const db = await getDatabase();
  return db.get('media', id);
}

export async function saveAnswerDraft(
  recordingId: string,
  questionId: string,
  text: string,
): Promise<void> {
  if (text.length > 10000) throw new Error('回答は10,000文字以内で入力してください。');
  const db = await getDatabase();
  await db.put('answerDrafts', text, `${recordingId}:${questionId}`);
}
export async function getAnswerDraft(
  recordingId: string,
  questionId: string,
): Promise<string | undefined> {
  const db = await getDatabase();
  return db.get('answerDrafts', `${recordingId}:${questionId}`);
}
export async function deleteAnswerDraft(recordingId: string, questionId: string): Promise<void> {
  const db = await getDatabase();
  await db.delete('answerDrafts', `${recordingId}:${questionId}`);
}
export async function deleteRecordingDrafts(recordingId: string): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction('answerDrafts', 'readwrite');
  for (const key of await tx.store.getAllKeys())
    if (key.startsWith(`${recordingId}:`)) await tx.store.delete(key);
  await tx.done;
}

export async function deleteMedia(id: string): Promise<void> {
  const db = await getDatabase();
  await db.delete('media', id);
}

/** Intentionally excludes credentials, settings, video bytes and extracted frame images. */
export function exportBackup(data: TeamData): string {
  const portable = parseTeamData(data);
  portable.recordings = portable.recordings.map((recording) => ({ ...recording, frames: [] }));
  return JSON.stringify(
    {
      format: 'meisters-baton-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      mediaIncluded: false,
      notice: BACKUP_NOTICE,
      data: portable,
    },
    null,
    2,
  );
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

/** Merge new IDs only; differing records with an existing ID require an explicit resolution. */
export function mergeTeamData(current: TeamData, incoming: TeamData): TeamData {
  const existing = parseTeamData(current);
  const imported = parseTeamData(incoming);
  const merged = structuredClone(existing);
  const collections = ['recordings', 'articles', 'requests', 'activity'] as const;
  for (const collection of collections) {
    const items: { id: string }[] = merged[collection];
    const byId = new Map(items.map((item) => [item.id, item]));
    for (const item of imported[collection]) {
      const local = byId.get(item.id);
      if (local) {
        // The portable backup intentionally omits frame images. Keep local frames when all other fields match.
        const left = collection === 'recordings' ? { ...local, frames: [] } : local;
        const right = collection === 'recordings' ? { ...item, frames: [] } : item;
        if (canonical(left) !== canonical(right))
          throw new Error(
            `「${'title' in item ? item.title : collection}」に同じIDで異なる内容があります。既存データを守るため読み込みを中止しました。`,
          );
      } else {
        items.push(structuredClone(item));
        byId.set(item.id, item);
      }
    }
  }
  return parseTeamData(merged);
}

export function importBackup(json: string, current?: TeamData): TeamData {
  if (json.length > 50 * 1024 * 1024)
    throw new Error('バックアップは50MB以内のJSONファイルを選んでください。');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(
      'JSONファイルを読み取れませんでした。Meister’s Batonのバックアップを選んでください。',
    );
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('バックアップの形式が不正です。');
  const envelope = parsed as Record<string, unknown>;
  if (
    envelope.format !== 'meisters-baton-backup' ||
    envelope.version !== 1 ||
    envelope.mediaIncluded !== false
  )
    throw new Error('このバージョンでは読み込めないバックアップ形式です。');
  const data = parseTeamData(envelope.data);
  if (data.recordings.some((recording) => recording.frames.length))
    throw new Error('バックアップに未対応の画像データが含まれています。');
  return current ? mergeTeamData(current, data) : data;
}

/** Explicit local reset, including media. Call only from a confirmed user action. */
export async function clearLocalData(): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(['state', 'media', 'answerDrafts'], 'readwrite');
  await Promise.all([
    tx.objectStore('state').clear(),
    tx.objectStore('media').clear(),
    tx.objectStore('answerDrafts').clear(),
  ]);
  await tx.done;
}
