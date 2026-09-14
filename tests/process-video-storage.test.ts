import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  saveProcessVideo,
  loadProcessVideos,
  deleteProcessVideos,
} from '../src/lib/processVideoStorage';
import { clearLocalData, deleteRecordingDrafts } from '../src/lib/storage';
import type { ProcessVideoRun } from '../src/domain/processVideo';

const value = (id: string, teamId: string, recordingId: string) => ({
  // Storage treats the already-validated run as opaque; this fixture has no production content.
  run: { id, teamId, recordingId, createdAt: '2026-09-13' } as ProcessVideoRun,
});
describe('generated video retention', () => {
  it('isolates teams and removes videos with the corresponding record or local reset', async () => {
    await deleteProcessVideos();
    await saveProcessVideo(value('a', 'team-a', 'record-a'));
    await saveProcessVideo(value('b', 'team-b', 'record-b'));
    expect(await loadProcessVideos('team-b', 'record-a')).toEqual([]);
    await deleteRecordingDrafts('record-a');
    expect(await loadProcessVideos('team-a', 'record-a')).toEqual([]);
    expect(await loadProcessVideos('team-b', 'record-b')).toHaveLength(1);
    await clearLocalData();
    expect(await loadProcessVideos('team-b', 'record-b')).toEqual([]);
  });
  it('does not persist a result after its session/operation guard is invalidated', async () => {
    await expect(
      saveProcessVideo(value('late', 'team-a', 'record-a'), () => {
        throw Error('session changed');
      }),
    ).rejects.toThrow('session changed');
    expect(await loadProcessVideos('team-a', 'record-a')).toEqual([]);
  });
});
