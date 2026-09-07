import { useEffect, useRef, useState } from 'react';
import { Film, LoaderCircle } from 'lucide-react';
import type { Recording } from '../domain/types';
import { getMedia, putMedia } from '../lib/storage';
import { fetchRemoteMedia } from '../lib/api';
import { useBaton } from '../state';
import { CraftIllustration } from './ui';
export function VideoPlayer({ recording, time = 0 }: { recording: Recording; time?: number }) {
  const { settings, auth } = useBaton();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let disposed = false,
      objectUrl = '';
    setUrl('');
    setError('');
    setLoading(true);
    (async () => {
      let blob = recording.mediaId ? await getMedia(recording.mediaId) : undefined;
      if (!blob && recording.remoteMediaId && auth) {
        blob = await fetchRemoteMedia(settings, recording.remoteMediaId);
        if (recording.mediaId) await putMedia(blob, recording.mediaId);
      }
      if (blob && !disposed) {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } else if (!disposed && !recording.isDemo)
        setError(
          'この端末に元の動画がありません。元の端末、またはチーム共有から動画を確認できます。',
        );
    })()
      .catch((e) => !disposed && setError(e.message))
      .finally(() => !disposed && setLoading(false));
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [recording.id, recording.mediaId, recording.remoteMediaId, auth]);
  useEffect(() => {
    if (ref.current && url) ref.current.currentTime = time;
  }, [time, url]);
  if (loading)
    return (
      <div className="video-placeholder">
        <LoaderCircle className="spinning" />
        動画を読み込んでいます
      </div>
    );
  if (url)
    return (
      <>
        <video
          ref={ref}
          className="video-player"
          src={url}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={() => {
            if (ref.current) ref.current.currentTime = time;
          }}
          onError={() =>
            setError('この端末では動画を再生できません。別の形式で取り込んでください。')
          }
          aria-label={`${recording.title}の元動画`}
        />
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
      </>
    );
  if (recording.isDemo)
    return (
      <div className="sample-player">
        <CraftIllustration />
        <span>サンプル資料 · 映像の代わりに工程イメージを表示</span>
      </div>
    );
  return (
    <div className="video-placeholder">
      <Film />
      <p>{recording.duration === 0 ? 'この記録は作業メモから作成しています。' : error}</p>
    </div>
  );
}
