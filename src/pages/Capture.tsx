import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileVideo,
  Film,
  LoaderCircle,
  MessageCircle,
  Plus,
  Save,
  Sparkles,
  Square,
  Upload,
  Video,
} from 'lucide-react';
import { useBaton } from '../state';
import { Badge, Empty, Modal, PageTitle, ProgressSteps } from '../components/ui';
import { VideoPlayer } from '../components/VideoPlayer';
import { createManualAnalysis, draftArticle, formatTime, makeId } from '../domain';
import type { Analysis, Article, Claim, Recording } from '../domain/types';
import {
  putMedia,
  getAnswerDraft,
  saveAnswerDraft,
  deleteAnswerDraft,
  deleteMedia,
  deleteRecordingDrafts,
} from '../lib/storage';
import { inspectVideo } from '../lib/media';
import { api } from '../lib/api';
const categories = ['プロペラ', '翼', '機体・フレーム', '電装・制御', '工具・治具', 'その他'];
export function CapturePage() {
  const { data, settings, mutate, navigate, toast } = useBaton();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('プロペラ');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);
  const chooseFile = (value?: File) => {
    if (!value) return;
    setFile(value);
    setError('');
    if (!title) setTitle(value.name.replace(/\.[^.]+$/, ''));
  };
  const camera = async () => {
    if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
      captureRef.current?.click();
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          'この環境では直接撮影できません。端末のカメラで撮影して動画を選んでください。',
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
        audio: true,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch (e) {
      setError(
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'カメラを使うにはブラウザの許可が必要です。撮影済みの動画も選べます。'
          : e instanceof Error
            ? e.message
            : '撮影を開始できません。',
      );
    }
  };
  const startRecording = () => {
    if (!streamRef.current) return;
    const type = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/mp4',
      'video/webm',
    ].find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(streamRef.current, type ? { mimeType: type } : undefined);
    const chunks: BlobPart[] = [];
    let bytes = 0;
    recorder.ondataavailable = (e) => {
      if (e.data.size) {
        chunks.push(e.data);
        bytes += e.data.size;
        if (bytes > 240 * 1024 * 1024 && recorder.state === 'recording') recorder.stop();
      }
    };
    recorder.onstop = () => {
      chooseFile(
        new File(
          chunks,
          `作業記録-${new Date().toISOString().slice(0, 10)}.${recorder.mimeType.includes('mp4') ? 'mp4' : 'webm'}`,
          { type: recorder.mimeType },
        ),
      );
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setRecording(false);
      setCameraOpen(false);
    };
    recorderRef.current = recorder;
    setElapsed(0);
    recorder.start(1000);
    setRecording(true);
  };
  const create = async () => {
    if (!title.trim()) {
      setError('作業の名前を入れてください。');
      return;
    }
    if (!file && !notes.trim()) {
      setError('動画を選ぶか、残したい作業メモを入力してください。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let duration = 0,
        frames: Recording['frames'] = [],
        mediaId: string | undefined;
      if (file) {
        const inspected = await inspectVideo(file, setProgress);
        duration = inspected.duration;
        frames = inspected.frames;
        mediaId = await putMedia(file);
      }
      const now = new Date().toISOString();
      const record: Recording = {
        id: makeId('rec'),
        title: title.trim(),
        category,
        author: settings.displayName || '作業者',
        createdAt: now,
        updatedAt: now,
        duration,
        frames,
        mediaId,
        fileName: file?.name,
        mimeType: file?.type,
        notes: notes.trim(),
        answers: [],
        status: 'recorded',
        isDemo: false,
      };
      await mutate((d) => ({
        ...d,
        recordings: [record, ...d.recordings],
        activity: [
          {
            id: makeId(),
            type: 'record',
            title: `${record.title}を記録`,
            createdAt: now,
            targetId: record.id,
          },
          ...d.activity,
        ],
      }));
      toast('作業をこの端末に保存しました');
      navigate(`recording/${record.id}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '保存できませんでした。空き容量を確認してください。',
      );
    } finally {
      setBusy(false);
    }
  };
  const demo = async () => {
    const source = data.recordings.find((r) => r.isDemo && r.analysis);
    if (!source) {
      toast('設定からサンプル資料を追加できます');
      return;
    }
    const now = new Date().toISOString();
    const record: Recording = {
      ...structuredClone(source),
      id: makeId('demo'),
      title: 'サンプル体験：積層前の判断',
      answers: [],
      createdAt: now,
      updatedAt: now,
      status: 'interview',
    };
    await mutate((d) => ({ ...d, recordings: [record, ...d.recordings] }));
    navigate(`recording/${record.id}`);
  };
  return (
    <>
      <PageTitle title="新しい記録" back={() => navigate('home')} />
      <ProgressSteps current={0} />
      <div className="capture-layout">
        <section className="capture-form">
          <div
            className={`upload-zone ${file ? 'has-file' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              chooseFile(e.dataTransfer.files[0]);
            }}
          >
            <div className="upload-symbol">
              {file ? <FileVideo size={31} /> : <Video size={31} />}
            </div>
            <h2>{file ? file.name : '作業動画'}</h2>
            <p>
              {file
                ? `${(file.size / 1024 / 1024).toFixed(1)} MB · 保存前に映像を読み取ります`
                : '撮影した動画やタイムラプスを選んでください。'}
            </p>
            <div className="button-row">
              <button
                className="button primary"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={18} />
                {file ? '動画を選び直す' : '動画を選ぶ'}
              </button>
              <button className="button" disabled={busy} onClick={() => void camera()}>
                <Camera size={18} />
                撮影する
              </button>
            </div>
            <small>MP4・WebMなど、端末で再生できる動画 / 250MB・60分まで</small>
            <input
              hidden
              ref={fileRef}
              type="file"
              accept="video/*"
              onChange={(e) => chooseFile(e.target.files?.[0])}
            />
            <input
              hidden
              ref={captureRef}
              type="file"
              accept="video/*"
              capture="environment"
              onChange={(e) => chooseFile(e.target.files?.[0])}
            />
          </div>
          <div className="form-body">
            <label>
              作業の名前<span className="required">必須</span>
              <input
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例：プロペラの積層前チェック"
                disabled={busy}
              />
            </label>
            <div className="form-two">
              <label>
                班・カテゴリー
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={busy}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                記録する人
                <input value={settings.displayName || '作業者'} readOnly />
                <small>工房の設定から変更できます</small>
              </label>
            </div>
            <label>
              作業メモ<span className="optional">動画がないときは、ここからでも。</span>
              <textarea
                rows={4}
                value={notes}
                maxLength={10000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="今日やったこと、工夫したこと、次の人に伝えたいこと。"
                disabled={busy}
              />
            </label>
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            {busy && (
              <div className="processing">
                <LoaderCircle className="spinning" size={18} />
                {file ? `映像を読み取り中 ${Math.round(progress * 100)}%` : '記録を保存中'}
                <progress aria-label="映像の読み取り進捗" value={progress} max={1} />
              </div>
            )}
            <div className="form-footer">
              <p>
                <Save size={15} />
                最初に、この端末へ保存します。
              </p>
              <button className="button primary" onClick={() => void create()} disabled={busy}>
                {busy ? '保存しています' : '保存して、判断を残す'}
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </section>
        <aside className="capture-aside">
          <div className="paper-note">
            <span className="note-icon">
              <MessageCircle size={24} />
            </span>
            <h2>記録後の流れ</h2>
            <p>動画やメモの保存後、判断の理由を聞き取り、Wikiの下書きを作成します。</p>
            <ul>
              <li>
                <Check size={16} />
                途中でやめても、続きから
              </li>
              <li>
                <Check size={16} />
                原文と映像を一緒に保存
              </li>
              <li>
                <Check size={16} />
                確認してから、Wikiへ
              </li>
            </ul>
          </div>
          <button className="demo-link" onClick={() => void demo()}>
            <Film size={19} />
            <span>
              サンプルを試す<small>聞き取り・確認・Wiki作成</small>
            </span>
            <ChevronArrow />
          </button>
          <p className="privacy-hint">
            撮影前に、映る人の同意と撮影可能な場所かを確認してください。AIへの送信は解析時に選べます。
          </p>
        </aside>
      </div>
      {cameraOpen && (
        <Modal
          title="作業を撮影する"
          close={() => {
            if (recording) recorderRef.current?.stop();
            else {
              streamRef.current?.getTracks().forEach((t) => t.stop());
              setCameraOpen(false);
            }
          }}
        >
          <video className="camera-preview" ref={videoRef} autoPlay muted playsInline />
          <div className="camera-controls">
            <span className={recording ? 'recording-indicator' : ''}>{formatTime(elapsed)}</span>
            <button
              className="button primary"
              onClick={() => (recording ? recorderRef.current?.stop() : startRecording())}
            >
              {recording ? <Square size={18} /> : <Camera size={18} />}
              {recording ? '撮影を終えて保存' : '撮影を開始'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function ChevronArrow() {
  return <ArrowUpIcon />;
}
function ArrowUpIcon() {
  return <ArrowRight size={18} />;
}
function RecordingManagement({ record }: { record: Recording }) {
  const { data, mutate, navigate, toast } = useBaton();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const linked = data.articles.filter((a) => a.recordingId === record.id);
  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await mutate((current) => {
        const removedIds = new Set([
          record.id,
          ...current.articles.filter((a) => a.recordingId === record.id).map((a) => a.id),
        ]);
        return {
          ...current,
          recordings: current.recordings.filter((r) => r.id !== record.id),
          articles: current.articles.filter((a) => a.recordingId !== record.id),
          requests: current.requests.map((r) =>
            r.articleId && removedIds.has(r.articleId)
              ? { ...r, articleId: undefined, status: 'open' }
              : r,
          ),
          activity: current.activity.filter((a) => !a.targetId || !removedIds.has(a.targetId)),
        };
      });
      if (
        record.mediaId &&
        !data.recordings.some((r) => r.id !== record.id && r.mediaId === record.mediaId)
      )
        await deleteMedia(record.mediaId);
      await deleteRecordingDrafts(record.id);
      toast('作業記録と関連Wikiをこの端末から削除しました');
      navigate('library/records');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className="text-button danger-text record-delete" onClick={() => setOpen(true)}>
        この作業記録を削除する
      </button>
      {open && (
        <Modal
          title="作業記録を削除しますか"
          close={() => {
            if (!busy) setOpen(false);
          }}
        >
          <div className="modal-body">
            <p>
              「{record.title}」の動画・回答・入力途中の文章と、ここから作成したWiki {linked.length}
              件をこの端末から削除します。
            </p>
            {record.remoteMediaId && (
              <p>チームへ共有した記録は残ります。共有先の削除はチーム管理者に確認してください。</p>
            )}
            <p>この操作は元に戻せません。</p>
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            <button className="button danger" disabled={busy} onClick={() => void remove()}>
              作業記録と関連Wikiを削除
            </button>
            <button className="button" disabled={busy} onClick={() => setOpen(false)}>
              キャンセル
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function InterviewPage({ id }: { id: string }) {
  const { data, settings, auth, mutate, configure, navigate, toast } = useBaton();
  const record = data.recordings.find((r) => r.id === id);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [time, setTime] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(false);
  const analysis = record?.analysis;
  const questions = analysis?.questions ?? [];
  const question = questions[index];
  const stored = record?.answers
    .slice()
    .reverse()
    .find((a) => a.questionId === question?.id);
  useEffect(() => {
    let disposed = false;
    setAnswer(stored?.text ?? '');
    if (question)
      void getAnswerDraft(id, question.id)
        .then((draft) => {
          if (!disposed && draft !== undefined) setAnswer(draft);
        })
        .catch(() => {});
    const segment = analysis?.segments.find((s) => s.id === question?.segmentId);
    if (segment) setTime(segment.start);
    return () => {
      disposed = true;
    };
  }, [question?.id, stored?.id]);
  if (!record)
    return (
      <Empty
        title="記録が見つかりません"
        text="削除されたか、この端末にまだ共有されていない記録です。"
        action={
          <button className="button" onClick={() => navigate('home')}>
            工房へ
          </button>
        }
      />
    );
  const update = async (patch: Partial<Recording>) => {
    await mutate((d) => ({
      ...d,
      recordings: d.recordings.map((r) =>
        r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r,
      ),
    }));
  };
  const manual = async () => {
    setBusy(true);
    try {
      await update({ analysis: createManualAnalysis(record, [time]), status: 'interview' });
      setIndex(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const analyze = async () => {
    if (!auth) {
      toast('AIを使うには、工房の設定でチームに接続してください');
      return;
    }
    if (!settings.aiConsent) {
      setConsent(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api<Analysis>(settings, '/api/ai/analyze', {
        method: 'POST',
        sessionToken: auth?.token,
        sessionTeamId: auth?.user.teamId,
        body: {
          recording: record,
          context: data.articles.filter((a) => !a.isDemo && a.status === 'published').slice(0, 10),
        },
      });
      await update({ analysis: result, status: 'interview' });
      setIndex(0);
      toast('映像から、確認したい判断を整理しました');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const saveAnswer = async () => {
    if (!question || !answer.trim()) return record;
    if (stored?.text === answer.trim()) return record;
    const text = answer.trim();
    const next = {
      ...record,
      answers: [
        ...record.answers,
        {
          id: makeId('answer'),
          questionId: question.id,
          text,
          author: settings.displayName || '作業者',
          createdAt: new Date().toISOString(),
          source: 'text' as const,
        },
      ],
    };
    await update({ answers: next.answers });
    await deleteAnswerDraft(id, question.id);
    return next;
  };
  const next = async () => {
    try {
      setBusy(true);
      await saveAnswer();
      if (index < questions.length - 1) setIndex(index + 1);
      else toast('回答を保存しました。Wikiの下書きに進めます。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const generate = async (useAI = false) => {
    setBusy(true);
    setError('');
    try {
      const current = await saveAnswer();
      if (current.answers.length === 0) {
        setError('判断を一つ以上答えてから、Wikiにまとめてください。');
        return;
      }
      let article = draftArticle(current);
      if (useAI) {
        if (!settings.aiConsent) {
          setError('先に工房の設定でAIへの送信を有効にしてください。');
          return;
        }
        const generated = await api<Pick<Article, 'title' | 'summary' | 'tags' | 'claims'>>(
          settings,
          '/api/ai/generate',
          {
            method: 'POST',
            sessionToken: auth?.token,
            sessionTeamId: auth?.user.teamId,
            body: { recording: current },
          },
        );
        article = {
          ...article,
          ...generated,
          claims: generated.claims.map((c: Claim) => ({
            ...c,
            review: 'draft',
            reviewedAt: undefined,
            reviewedBy: undefined,
          })),
        };
      }
      await mutate((d) => ({
        ...d,
        articles: [article, ...d.articles],
        recordings: d.recordings.map((r) => (r.id === id ? { ...current, status: 'draft' } : r)),
      }));
      toast('あなたの回答から、Wikiの下書きを作りました');
      navigate(`article/${article.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const answered = questions.filter((q) =>
    record.answers.some((a) => a.questionId === q.id && a.text.trim()),
  ).length;
  return (
    <>
      <PageTitle
        label={record.isDemo ? 'サンプル体験' : '作業を記録しました'}
        title={record.title}
        back={() => navigate('home')}
      >
        <Badge tone={record.isDemo ? 'amber' : 'green'}>
          {record.isDemo ? 'デモ資料' : '端末に保存済み'}
        </Badge>
      </PageTitle>
      <ProgressSteps current={1} />
      <div className="interview-layout">
        <section className="evidence-workspace">
          <VideoPlayer recording={record} time={time} />
          <div className="video-caption">
            <span>
              <Clock3 size={14} />
              {formatTime(record.duration)}
            </span>
            <span>{record.category}</span>
            <span>{record.author}</span>
          </div>
          {record.frames.length > 0 && (
            <div className="frame-strip" aria-label="動画の確認時刻">
              {record.frames.map((frame) => (
                <button
                  className={Math.abs(frame.time - time) < 0.1 ? 'selected' : ''}
                  key={frame.id}
                  onClick={() => setTime(frame.time)}
                >
                  <img src={frame.dataUrl} alt={`${formatTime(frame.time)}のフレーム`} />
                  <span>{formatTime(frame.time)}</span>
                </button>
              ))}
            </div>
          )}
          <details className="record-details">
            <summary>作業の流れ・メモ・記録の管理</summary>
            {analysis && (
              <div className="segment-list">
                <h2>作業の流れ</h2>
                {analysis.segments.map((segment) => (
                  <button
                    key={segment.id}
                    className={question?.segmentId === segment.id ? 'active' : ''}
                    onClick={() => setTime(segment.start)}
                  >
                    <span>{formatTime(segment.start)}</span>
                    <div>
                      <strong>{segment.title}</strong>
                      <p>{segment.observation}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {record.notes && (
              <div className="record-note">
                <h3>記録したメモ</h3>
                <p>{record.notes}</p>
              </div>
            )}
            <RecordingManagement record={record} />
          </details>
        </section>
        <section className="interview-panel">
          {!analysis ? (
            <div className="analysis-start">
              <span className="assistant-avatar">
                <Sparkles size={24} />
              </span>
              <h2>
                映像に映らない判断を、
                <br />
                一緒に残しましょう。
              </h2>
              <p>AIは動画から抜き出した最大12枚の画像とメモを読み、確かめたいことを質問します。</p>
              <button
                className="button primary full"
                onClick={() => void analyze()}
                disabled={busy || record.duration === 0}
              >
                <Sparkles size={18} />
                {busy ? '映像を確認しています' : 'AIに映像を見てもらう'}
              </button>
              {!auth && <small>AIはチーム接続とサーバーのAPI設定後に使えます。</small>}
              <div className="or-divider">または</div>
              <h3>あなたが選んだ場面から残す</h3>
              <p>映像を確認しながら、判断・工夫・注意点を3つの問いで記録します。</p>
              {record.duration > 0 && (
                <label>
                  判断を残したい時刻（秒）
                  <input
                    type="number"
                    min={0}
                    max={record.duration}
                    step={0.1}
                    value={time}
                    onChange={(e) =>
                      setTime(Math.max(0, Math.min(record.duration, Number(e.target.value))))
                    }
                  />
                </label>
              )}
              <button className="button full" onClick={() => void manual()} disabled={busy}>
                <MessageCircle size={18} />
                手動で判断を残す
              </button>
            </div>
          ) : (
            <>
              <div className="interview-top">
                <span className="assistant-avatar">
                  <Sparkles size={21} />
                </span>
                <div>
                  <h2>そのとき、何を考えましたか。</h2>
                  <p>
                    {analysis.mode === 'ai'
                      ? 'AIが見つけた、映像だけでは分からないこと'
                      : analysis.mode === 'demo'
                        ? '用意したサンプル質問に答えて体験できます'
                        : 'あなたの判断を残すための、3つの問い'}
                  </p>
                </div>
              </div>
              <div className="interview-mode">
                <Badge tone={analysis.mode === 'ai' ? 'green' : 'amber'}>
                  {analysis.mode === 'ai'
                    ? 'AIからの質問'
                    : analysis.mode === 'demo'
                      ? 'デモ用の質問'
                      : '手動ヒアリング'}
                </Badge>
                <span>
                  {answered} / {questions.length} 問を保存
                </span>
              </div>
              <div className="question-pips" aria-label="質問を選ぶ">
                {questions.map((q, i) => (
                  <button
                    key={q.id}
                    onClick={() => {
                      if (answer.trim() !== stored?.text?.trim() && answer.trim()) {
                        void saveAnswer()
                          .then(() => setIndex(i))
                          .catch((e) => setError(e.message));
                      } else setIndex(i);
                    }}
                    aria-label={`質問${i + 1}`}
                    className={
                      i === index
                        ? 'active'
                        : record.answers.some((a) => a.questionId === q.id)
                          ? 'done'
                          : ''
                    }
                  >
                    {record.answers.some((a) => a.questionId === q.id) ? (
                      <Check size={15} />
                    ) : (
                      i + 1
                    )}
                  </button>
                ))}
              </div>
              {question && (
                <>
                  <div className="question-card">
                    <span className="question-type">
                      {question.kind === 'judgment'
                        ? '判断基準'
                        : question.kind === 'warning'
                          ? '失敗を防ぐ工夫'
                          : '手順の理由'}
                    </span>
                    <h3>{question.text}</h3>
                    <p>
                      <CircleHelp size={15} />
                      {question.reason}
                    </p>
                    <button
                      className="timestamp"
                      onClick={() =>
                        setTime(
                          analysis.segments.find((s) => s.id === question.segmentId)?.start ?? 0,
                        )
                      }
                    >
                      <Video size={14} />
                      {formatTime(
                        analysis.segments.find((s) => s.id === question.segmentId)?.start ?? 0,
                      )}
                      の場面を確認
                    </button>
                  </div>
                  <label className="answer-label">
                    あなたの言葉で
                    <textarea
                      rows={6}
                      value={answer}
                      maxLength={10000}
                      onChange={(e) => {
                        const text = e.target.value;
                        setAnswer(text);
                        void saveAnswerDraft(id, question.id, text).catch((e) =>
                          setError(e.message),
                        );
                      }}
                      placeholder="何を見たか、どう判断したか。短くても大丈夫です。"
                      disabled={busy}
                    />
                  </label>
                  <div className="answer-helper">
                    <span>入力中も端末に保存。キーボードの音声入力も使えます。</span>
                    {stored?.text === answer.trim() && (
                      <span className="saved">
                        <CheckCircle2 size={13} />
                        保存済み
                      </span>
                    )}
                  </div>
                  <div className="interview-actions">
                    <button
                      className="text-button"
                      disabled={busy || index === 0}
                      onClick={() => {
                        void saveAnswer()
                          .then(() => setIndex(index - 1))
                          .catch((e) => setError(e.message));
                      }}
                    >
                      <ArrowLeft size={16} />
                      前へ
                    </button>
                    <button
                      className="button primary"
                      disabled={busy || !answer.trim()}
                      onClick={() => void next()}
                    >
                      {index < questions.length - 1 ? '回答を保存して次へ' : '回答を保存'}
                      <ArrowRight size={17} />
                    </button>
                  </div>
                </>
              )}
              <div className="draft-action">
                <BookOpen size={23} />
                <div>
                  <h3>判断を、引き継げる知識へ。</h3>
                  <p>回答を原文のまま整理します。未回答は断定しません。</p>
                </div>
                <button
                  className="button full"
                  disabled={busy || (!record.answers.length && !answer.trim())}
                  onClick={() => void generate()}
                >
                  Wikiの下書きを作る
                  <ArrowRight size={17} />
                </button>
                {auth && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => void generate(true)}
                  >
                    <Sparkles size={15} />
                    AIで整理して下書きにする
                  </button>
                )}
              </div>
              {analysis.limitations.length > 0 && (
                <details className="limitations">
                  <summary>この記録でまだ分からないこと</summary>
                  <ul>
                    {analysis.limitations.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          {busy && (
            <div className="processing" role="status">
              <LoaderCircle size={17} className="spinning" />
              処理中です。記録は保存されています。
            </div>
          )}
        </section>
      </div>
      {consent && (
        <Modal title="AIに送る内容を確認" close={() => setConsent(false)}>
          <div className="modal-body">
            <p>
              この作業から抜き出した画像（最大12枚）、作業メモ、チームの確認済み知識を、設定したサーバー経由でOpenAIへ送ります。動画の音声は解析しません。
            </p>
            <p>
              映っている人や工房の機密情報を共有できることを確認してください。設定からいつでも無効にできます。
            </p>
            <button
              className="button primary full"
              onClick={() => {
                void configure({ aiConsent: true }).then(() => {
                  setConsent(false);
                  toast('送信を有効にしました。「AIに映像を見てもらう」から解析できます');
                });
              }}
            >
              この内容の送信を有効にする
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
