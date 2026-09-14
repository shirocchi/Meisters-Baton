import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useBaton } from './state';
import { loadGrowiWiki } from './lib/growiWiki';
import { loadWikiEdits, saveWikiEdit } from './lib/wikiWorkshop';
import { getMedia } from './lib/storage';
import { SUPABASE_MEDIA_LIMIT, uploadTeamMedia } from './lib/supabase';
import type { WikiArchive, WikiPage } from './domain/growiWiki';
import type { Recording } from './domain/types';
import {
  insertProcessVideo,
  processVideoMedia,
  validateVideoEvidence,
} from './domain/processVideoWiki';
import {
  loadProcessVideos,
  saveProcessVideo,
  type SavedProcessVideo,
} from './lib/processVideoStorage';
import { readProcessVideoMetadata } from './lib/processVideoMetadata';
import {
  automaticTarget,
  eligibleRecording,
  integrateRecording,
  recordingFingerprint,
  snapshotRecording,
  type WikiEdit,
  type WorkshopMedia,
} from './domain/wikiWorkshop';

interface WikiStore {
  archive?: WikiArchive;
  pages: WikiPage[];
  edits: WikiEdit[];
  error: string;
  editError: string;
  busy: string;
  refresh: () => Promise<void>;
  save: (
    page: WikiPage,
    title: string,
    body: string,
    reason: string,
    version: number,
    media?: WorkshopMedia[],
  ) => Promise<void>;
  integrate: (recording: Recording, page: WikiPage, heading?: string) => Promise<void>;
  attachVideo: (input: {
    recording: Recording;
    video: SavedProcessVideo;
    page: WikiPage;
    version: number;
    heading: string;
    explanation: string;
  }) => Promise<void>;
  pending: Recording[];
}
const Context = createContext<WikiStore | null>(null);
export function useWiki() {
  const value = useContext(Context);
  if (!value) throw Error('Wiki store missing');
  return value;
}
export function WikiProvider({ children }: { children: ReactNode }) {
  const { auth, data, mutate, toast, online } = useBaton();
  const identity = auth ? `${auth.user.id}:${auth.user.teamId}:${auth.token}` : '';
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const recordsRef = useRef(data.recordings);
  recordsRef.current = data.recordings;
  const [result, setResult] = useState<{
    identity: string;
    archive?: WikiArchive;
    edits: WikiEdit[];
    error: string;
    editError: string;
  }>();
  const [busy, setBusy] = useState('');
  const editsRef = useRef<WikiEdit[]>([]);
  const lock = useRef(false);
  const current = result?.identity === identity ? result : undefined;
  const archive = auth ? current?.archive : undefined;
  const edits = current?.edits ?? [];
  const sourcePages = useMemo(
    () =>
      archive
        ? [...(archive.home ? [archive.home] : []), ...archive.pages, ...(archive.diary ?? [])]
        : [],
    [archive],
  );
  const pages = useMemo(
    () =>
      sourcePages.map((p) => {
        const edit = edits.find((e) => e.page_id === p.id);
        return edit
          ? {
              ...p,
              title: edit.title,
              body: edit.body,
              updatedAt: edit.updated_at,
              author: edit.author,
            }
          : p;
      }),
    [sourcePages, edits],
  );
  const refresh = useCallback(async () => {
    if (!auth) return;
    const expected = identity;
    try {
      const [archive, editResult] = await Promise.all([
        loadGrowiWiki(auth.token, new AbortController().signal),
        loadWikiEdits(auth)
          .then((edits) => ({ edits, error: '' }))
          .catch((e: Error) => ({ edits: [], error: e.message })),
      ]);
      if (identityRef.current !== expected) return;
      editsRef.current = editResult.edits;
      setResult({
        identity: expected,
        archive,
        edits: editResult.edits,
        error: '',
        editError: editResult.error,
      });
    } catch (e) {
      if (identityRef.current === expected)
        setResult({ identity: expected, edits: [], error: (e as Error).message, editError: '' });
    }
  }, [identity]);
  useEffect(() => {
    editsRef.current = [];
    setResult(undefined);
    setBusy('');
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const focus = () => {
      if (auth && !lock.current) void refresh();
    };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [refresh]);
  const accept = (edit: WikiEdit, expected: string) => {
    if (identityRef.current !== expected) return;
    editsRef.current = [...editsRef.current.filter((e) => e.page_id !== edit.page_id), edit];
    setResult((prev) =>
      prev?.identity === expected ? { ...prev, edits: editsRef.current } : prev,
    );
  };
  const save: WikiStore['save'] = async (page, title, body, reason, version, media) => {
    if (!auth || !online)
      throw Error('保存には工房へのログインと通信が必要です。編集内容はこの画面に残っています。');
    const old = editsRef.current.find((e) => e.page_id === page.id);
    const saved = await saveWikiEdit(
      auth,
      {
        page_id: page.id,
        title,
        body,
        reason,
        events: old?.events ?? [],
        media: media ?? old?.media ?? [],
      },
      version,
    );
    if (identityRef.current !== identity)
      throw Error('ログイン先が変わったため、画面への反映を止めました。');
    accept(saved, identity);
  };
  const integrate: WikiStore['integrate'] = async (recording, page, heading = '') => {
    if (!auth || !online) throw Error('通信が戻り、ログインするとWikiへ反映できます。');
    const expected = identity;
    const fingerprint = await recordingFingerprint(recording);
    let old = editsRef.current.find((e) => e.page_id === page.id);
    if (old?.events.some((e) => e.recordingId === recording.id && e.fingerprint === fingerprint))
      return;
    let shared = recording;
    if (recording.mediaId && !recording.remoteMediaId) {
      const blob = await getMedia(recording.mediaId);
      if (blob && blob.size <= SUPABASE_MEDIA_LIMIT) {
        const remoteMediaId = await uploadTeamMedia(auth, blob);
        if (identityRef.current !== expected) throw Error('工房が変更されました。');
        shared = { ...recording, remoteMediaId };
        await mutate((d) => ({
          ...d,
          recordings: d.recordings.map((r) =>
            r.id === recording.id ? { ...r, remoteMediaId } : r,
          ),
        }));
      }
    }
    if (identityRef.current !== expected) throw Error('工房が変更されました。');
    old = editsRef.current.find((e) => e.page_id === page.id);
    const event = {
      recordingId: recording.id,
      fingerprint,
      heading,
      integratedAt: new Date().toISOString(),
      recording: snapshotRecording(shared),
    };
    const saved = await saveWikiEdit(
      auth,
      {
        page_id: page.id,
        title: old?.title ?? page.title,
        body: integrateRecording(old?.body ?? page.body, recording, heading),
        reason: `記録を自動反映：${recording.title}`.slice(0, 500),
        events: [...(old?.events ?? []).filter((e) => e.recordingId !== recording.id), event],
        media: old?.media ?? [],
      },
      old?.version ?? 0,
    );
    accept(saved, expected);
    toast(`「${page.title}」の本文へ記録を反映しました`);
  };
  const records = data.recordings.filter(eligibleRecording);
  const attachVideo: WikiStore['attachVideo'] = async ({
    recording,
    video,
    page,
    version,
    heading,
    explanation,
  }) => {
    if (!auth || !online || current?.editError || !archive)
      throw Error('Wikiの取得・ログイン・通信を確認してください。');
    if (lock.current) throw Error('別の記録を保存中です。少し待ってからお試しください。');
    const expected = identity;
    const guard = () => {
      if (identityRef.current !== expected)
        throw Error('工房・ログインが変わったため掲載を中止しました。');
      const old = editsRef.current.find((edit) => edit.page_id === page.id);
      if ((old?.version ?? 0) !== version)
        throw Error('別の更新が先に保存されました。最新の本文を確認してから掲載してください。');
    };
    const checkEvidence = async () => {
      guard();
      const latest = recordsRef.current.find((item) => item.id === recording.id);
      if (!latest) throw Error('元の記録が見つかりません。');
      await validateVideoEvidence(video.run, latest, auth.user.teamId);
      guard();
    };
    lock.current = true;
    try {
      await checkEvidence();
      if (
        !video.mp4 ||
        video.mp4.type !== 'video/mp4' ||
        !video.mp4.size ||
        video.mp4.size > SUPABASE_MEDIA_LIMIT
      )
        throw Error('50MB以内のMP4を書き出してから掲載してください。');
      const bytes = await crypto.subtle.digest('SHA-256', await video.mp4.arrayBuffer());
      const hash = Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, '0')).join(
        '',
      );
      if (hash !== video.sha256)
        throw Error('保存した動画の内容が一致しません。MP4を書き出し直してください。');
      const original = sourcePages.find((item) => item.id === page.id);
      if (!original || original.unavailable || original.isEmpty)
        throw Error('掲載できるWikiページを選んでください。');
      const old = editsRef.current.find((edit) => edit.page_id === page.id);
      const currentBody = old?.body ?? original.body;
      if (currentBody !== page.body)
        throw Error('本文が更新されました。掲載内容を確認し直してください。');
      if (old?.media.some((item) => item.processVideo?.runId === video.run.id))
        throw Error('この動画は掲載済みです。Wikiから確認できます。');
      // Validate the complete update before uploading. Only the selected block is added.
      const metadata = await readProcessVideoMetadata(video.mp4);
      let media = processVideoMedia(video.run, hash, video.mp4.size, '', metadata.duration);
      const body = insertProcessVideo(
        integrateRecording(currentBody, recording, heading),
        video.run,
        media.id,
        heading,
        explanation,
      );
      const fingerprint = await recordingFingerprint(recording);
      await checkEvidence();
      const receipt = (await loadProcessVideos(auth.user.teamId, recording.id)).find(
        (item) => item.run.id === video.run.id,
      )?.uploaded;
      await checkEvidence();
      let remotePath =
        receipt?.teamId === auth.user.teamId &&
        receipt.sha256 === hash &&
        receipt.remotePath.startsWith(`${auth.user.teamId}/`)
          ? receipt.remotePath
          : undefined;
      if (!remotePath) {
        remotePath = await uploadTeamMedia(auth, video.mp4);
        // Keep this receipt for retry after a Wiki conflict; never re-upload the same MP4.
        video = { ...video, uploaded: { teamId: auth.user.teamId, sha256: hash, remotePath } };
        await saveProcessVideo(video, () => {
          if (
            identityRef.current !== expected ||
            !recordsRef.current.some((item) => item.id === recording.id)
          )
            throw Error('ログイン先または元の記録が変わったため保存を中止しました。');
        });
      }
      await checkEvidence();
      media = { ...media, remotePath };
      const saved = await saveWikiEdit(
        auth,
        {
          page_id: page.id,
          title: old?.title ?? original.title,
          body,
          reason: `工程解説動画を掲載：${video.run.plan.title}`.slice(0, 500),
          events: [
            ...(old?.events ?? []).filter((event) => event.recordingId !== recording.id),
            {
              recordingId: recording.id,
              fingerprint,
              heading,
              integratedAt: new Date().toISOString(),
              recording: snapshotRecording(recording),
            },
          ],
          media: [...(old?.media ?? []), media],
        },
        version,
      );
      if (identityRef.current !== expected)
        throw Error('保存後にログイン先が変わりました。元の工房で履歴を確認してください。');
      accept(saved, expected);
      toast(`「${page.title}」へ解説動画を掲載しました`);
    } finally {
      lock.current = false;
    }
  };
  const pending = records.filter(
    (r) => !edits.some((e) => e.events.some((event) => event.recordingId === r.id)),
  );
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    if (!auth || !archive || current?.editError || !online) return;
    // Local connection verification must not publish its test recordings into team Wiki.
    if (import.meta.env.VITE_BATON_VERIFICATION === 'true') return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        if (lock.current) return;
        lock.current = true;
        const failures: string[] = [];
        try {
          for (const recording of records) {
            if (cancelled || identityRef.current !== identity) break;
            const fingerprint = await recordingFingerprint(recording);
            const existing = editsRef.current
              .flatMap((e) => e.events.map((event) => ({ event, pageId: e.page_id })))
              .find((e) => e.event.recordingId === recording.id);
            if (existing?.event.fingerprint === fingerprint) continue;
            const target = existing
              ? {
                  page: sourcePages.find((p) => p.id === existing.pageId)!,
                  heading: existing.event.heading,
                }
              : automaticTarget(recording, sourcePages);
            if (!target?.page) continue;
            setBusy(`「${recording.title}」を${target.page.title}へ反映中`);
            try {
              await integrate(recording, target.page, target.heading);
            } catch (e) {
              failures.push(`「${recording.title}」：${(e as Error).message}`);
            }
          }
        } catch (e) {
          if (identityRef.current === identity) setBusy((e as Error).message);
          return;
        } finally {
          lock.current = false;
          if (cancelled) setCycle((n) => n + 1);
        }
        if (!cancelled) setBusy(failures.join(' / '));
      })();
    }, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [data.recordings, archive, identity, online, current?.editError, cycle]);
  return (
    <Context.Provider
      value={{
        archive,
        pages,
        edits,
        error: current?.error ?? '',
        editError: current?.editError ?? '',
        busy,
        refresh,
        save,
        integrate,
        attachVideo,
        pending,
      }}
    >
      {children}
    </Context.Provider>
  );
}
