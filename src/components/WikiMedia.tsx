import { useEffect, useRef, useState } from 'react';
import { Film, Play } from 'lucide-react';
import { Modal } from './ui';
import { VideoPlayer } from './VideoPlayer';
import { useBaton } from '../state';
import { downloadTeamMedia } from '../lib/supabase';
import { formatTime } from '../domain';
import type { Recording } from '../domain/types';
import type { WorkshopMedia } from '../domain/wikiWorkshop';

export function WorkshopMediaView({ media }: { media: WorkshopMedia }) {
  const { auth } = useBaton();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [requested, setRequested] = useState(false);
  const holder = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRequested(true);
          observer.disconnect();
        }
      },
      { rootMargin: '160px' },
    );
    if (holder.current) observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!auth || !requested) return;
    let live = true,
      object = '';
    void downloadTeamMedia(auth, media.remotePath)
      .then((blob) => {
        if (live) {
          object = URL.createObjectURL(blob);
          setUrl(object);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
      setUrl('');
      if (object) URL.revokeObjectURL(object);
    };
  }, [auth?.token, media.remotePath, requested]);
  const content = url ? (
    media.type.startsWith('image/') ? (
      <img src={url} alt={media.name} />
    ) : (
      <video src={url} controls playsInline preload="metadata" aria-label={media.name} />
    )
  ) : null;
  return (
    <span className="ww-shared-media" ref={holder}>
      {content || (
        <button className="button" onClick={() => setRequested(true)}>
          <Film size={18} />
          {requested ? '読み込み中…' : `${media.name}を表示`}
        </button>
      )}
      {error && (
        <span role="alert">
          {error}
          <button
            onClick={() => {
              setRequested(false);
              setError('');
            }}
          >
            やり直す
          </button>
        </span>
      )}
    </span>
  );
}
export function InlineRecording({ recording, open }: { recording: Recording; open: () => void }) {
  const holder = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [time, setTime] = useState(0);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '160px' },
    );
    if (holder.current) observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);
  const hasVideo = !!recording.mediaId || !!recording.remoteMediaId;
  return (
    <figure className="ww-inline-recording" ref={holder}>
      {hasVideo &&
        (visible ? (
          <VideoPlayer recording={recording} time={time} />
        ) : (
          <div className="ww-media-loading">動画</div>
        ))}
      {recording.frames.length > 0 && (
        <div className="ww-inline-frames">
          {recording.frames.slice(0, hasVideo ? 3 : 6).map((frame) => (
            <button
              key={frame.id}
              onClick={() => (hasVideo ? setTime(frame.time) : open())}
              aria-label={`${formatTime(frame.time)}の場面`}
            >
              <img
                src={frame.dataUrl}
                alt={`${recording.title} ${formatTime(frame.time)}`}
                loading="lazy"
              />
              <span>{formatTime(frame.time)}</span>
            </button>
          ))}
        </div>
      )}
      <figcaption>
        <button className="ww-evidence-link" onClick={open}>
          元の記録と映像を確認
        </button>
      </figcaption>
    </figure>
  );
}
export function RecordingEvidence({
  recording,
  time = 0,
  close,
}: {
  recording: Recording;
  time?: number;
  close: () => void;
}) {
  const [at, setAt] = useState(time);
  const [frame, setFrame] = useState('');
  const { navigate } = useBaton();
  return (
    <Modal title={recording.title} close={close} wide>
      <div className="ww-evidence">
        <VideoPlayer recording={recording} time={at} />
        <div className="ww-timeline">
          {recording.analysis?.segments.map((segment) => (
            <button
              key={segment.id}
              className={at === segment.start ? 'active' : ''}
              onClick={() => setAt(segment.start)}
            >
              <Play size={15} />
              <span>{formatTime(segment.start)}</span>
              <strong>{segment.title}</strong>
              <small>{segment.observation}</small>
            </button>
          ))}
        </div>
        {recording.frames.length > 0 && (
          <div className="ww-frame-strip">
            {recording.frames.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setAt(f.time);
                  setFrame(f.dataUrl);
                }}
              >
                <img src={f.dataUrl} alt={`${formatTime(f.time)}の手元`} />
                <span>{formatTime(f.time)}</span>
              </button>
            ))}
          </div>
        )}
        {frame && <img className="ww-frame-large" src={frame} alt="選択した瞬間の拡大画像" />}
        {recording.notes && <blockquote>{recording.notes}</blockquote>}
        {recording.answers.map((a) => (
          <div className="ww-answer" key={a.id}>
            <strong>
              {recording.analysis?.questions.find((q) => q.id === a.questionId)?.text ??
                '作業者の判断'}
            </strong>
            <p>{a.text}</p>
            <small>{a.author}</small>
          </div>
        ))}
        {!recording.remoteMediaId && recording.duration > 0 && (
          <p className="ww-help">
            元動画は撮影した端末で再生できます。共有上限を超える動画は端末に残ります。
          </p>
        )}
        <button
          className="button"
          onClick={() => {
            close();
            navigate(`recording/${recording.id}`);
          }}
        >
          元の作業記録を開く
        </button>
      </div>
    </Modal>
  );
}
