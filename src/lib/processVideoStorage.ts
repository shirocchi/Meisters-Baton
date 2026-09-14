import { openDB } from 'idb';
import type { ProcessVideoRun } from '../domain/processVideo';

export interface SavedProcessVideo {
  run: ProcessVideoRun;
  mp4?: Blob;
  sha256?: string;
  uploaded?: { teamId: string; sha256: string; remotePath: string };
}
async function database() {
  return openDB('meisters-baton-process-video', 1, {
    upgrade(db) {
      db.createObjectStore('runs', { keyPath: 'run.id' });
    },
  });
}
export async function saveProcessVideo(value: SavedProcessVideo, guard: () => void = () => {}) {
  const db = await database();
  try {
    guard();
    await db.put('runs', value);
  } finally {
    db.close();
  }
}
export async function deleteProcessVideos(recordingId?: string) {
  const db = await database();
  try {
    const tx = db.transaction('runs', 'readwrite');
    if (!recordingId) await tx.store.clear();
    else {
      const rows = (await tx.store.getAll()) as SavedProcessVideo[];
      for (const row of rows)
        if (row.run.recordingId === recordingId) await tx.store.delete(row.run.id);
    }
    await tx.done;
  } finally {
    db.close();
  }
}
export async function loadProcessVideos(
  teamId: string,
  recordingId: string,
): Promise<SavedProcessVideo[]> {
  const db = await database();
  try {
    const rows = (await db.getAll('runs')) as SavedProcessVideo[];
    return rows
      .filter((row) => row.run.teamId === teamId && row.run.recordingId === recordingId)
      .sort((a, b) => b.run.createdAt.localeCompare(a.run.createdAt));
  } finally {
    db.close();
  }
}
