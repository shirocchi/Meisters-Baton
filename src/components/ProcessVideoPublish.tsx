import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useWiki } from '../wikiState';
import { useBaton } from '../state';
import type { Recording } from '../domain/types';
import type { WikiPage } from '../domain/growiWiki';
import { evidenceBody, matchRecording, wikiSections } from '../domain/wikiWorkshop';
import { validateVideoEvidence } from '../domain/processVideoWiki';
import type { SavedProcessVideo } from '../lib/processVideoStorage';

export function ProcessVideoPublish({
  record,
  video,
}: {
  record: Recording;
  video: SavedProcessVideo;
}) {
  const wiki = useWiki();
  const { auth, online, navigate } = useBaton();
  const matches = matchRecording(record, wiki.pages);
  const available = wiki.pages.filter(
    (page) => !page.unavailable && !page.isEmpty && !page.id.startsWith('diary-'),
  );
  const [pageId, setPageId] = useState(matches[0]?.page.id ?? '');
  const [heading, setHeading] = useState(matches[0]?.heading ?? '');
  const [explanation, setExplanation] = useState(video.run.plan.summary);
  const [preview, setPreview] = useState<{
    page: WikiPage;
    version: number;
    heading: string;
    explanation: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [evidenceIssue, setEvidenceIssue] = useState('元の記録との対応を確認中…');
  const page = available.find((item) => item.id === pageId);
  const sections = page ? wikiSections(page.body) : [];
  const uniqueSections = sections.filter(
    (section) => sections.filter((other) => other.title === section.title).length === 1,
  );
  const published = wiki.edits.find((edit) =>
    edit.media.some((media) => media.processVideo?.runId === video.run.id),
  );
  useEffect(() => {
    let active = true;
    setEvidenceIssue('元の記録との対応を確認中…');
    setPreview(undefined);
    if (auth)
      void validateVideoEvidence(video.run, record, auth.user.teamId)
        .then(() => {
          if (active) setEvidenceIssue('');
        })
        .catch((e: Error) => {
          if (active) setEvidenceIssue(e.message);
        });
    return () => {
      active = false;
    };
  }, [record, video.run, auth?.user.teamId]);
  const publish = async () => {
    if (!preview || busy) return;
    setBusy(true);
    setError('');
    try {
      await wiki.attachVideo({ recording: record, video, ...preview });
      setPreview(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (published)
    return (
      <div className="process-video-publication" role="status">
        <p>「{published.title}」に解説動画を掲載済みです。</p>
        <button className="button" onClick={() => navigate(`library/wiki/${published.page_id}`)}>
          掲載したWikiを開く
        </button>
      </div>
    );
  return (
    <section className="process-video-publication" aria-label="解説動画をWikiへ掲載">
      <h3>この動画をWikiの工程へ残す</h3>
      <p>
        動画・説明・元の記録と回答を、工房メンバーが読めるWikiへ追加します。掲載先と内容を確認してください。
      </p>
      {evidenceIssue && <p role="status">{evidenceIssue}</p>}
      {wiki.error || wiki.editError ? <p role="alert">{wiki.error || wiki.editError}</p> : null}
      <label>
        掲載するWikiページ
        <select
          value={pageId}
          disabled={busy}
          onChange={(e) => {
            setPageId(e.target.value);
            setHeading('');
            setPreview(undefined);
          }}
        >
          <option value="">掲載先を選ぶ</option>
          {available.map((item) => (
            <option key={item.id} value={item.id}>
              {item.path}
            </option>
          ))}
        </select>
      </label>
      <label>
        掲載する工程
        <select
          value={heading}
          disabled={busy}
          onChange={(e) => {
            setHeading(e.target.value);
            setPreview(undefined);
          }}
        >
          <option value="">ページ末尾</option>
          {uniqueSections.map((section) => (
            <option key={section.start} value={section.title}>
              {section.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        動画に添える説明
        <textarea
          value={explanation}
          rows={4}
          maxLength={3000}
          disabled={busy}
          onChange={(e) => {
            setExplanation(e.target.value);
            setPreview(undefined);
          }}
        />
      </label>
      <button
        className="button"
        disabled={
          busy ||
          !page ||
          !online ||
          !!evidenceIssue ||
          !!wiki.error ||
          !!wiki.editError ||
          !explanation.trim()
        }
        onClick={() => {
          if (page) {
            setError('');
            setPreview({
              page: { ...page },
              version: wiki.edits.find((e) => e.page_id === page.id)?.version ?? 0,
              heading,
              explanation,
            });
          }
        }}
      >
        掲載内容を確認する
      </button>
      {preview && (
        <div className="process-video-publication-preview">
          <h4>
            {preview.page.title} ／ {preview.heading || 'ページ末尾'} に追加
          </h4>
          <strong>{video.run.plan.title}</strong>
          <p style={{ whiteSpace: 'pre-wrap' }}>{preview.explanation}</p>
          <p>説明用の概念図です。製法の確認・承認を示すものではありません。</p>
          <ol>
            {video.run.plan.scenes.map((scene, index) => (
              <li key={index}>{scene.title}</li>
            ))}
          </ol>
          {video.run.plan.missingEvidence.map((item, i) => (
            <p key={i}>未確認：{item}</p>
          ))}
          <details>
            <summary>一緒に残す記録と出典を確認</summary>
            <ReactMarkdown>{evidenceBody(record)}</ReactMarkdown>
            <ul>
              {video.run.sources.map((source) => (
                <li key={source.id}>{source.title}</li>
              ))}
            </ul>
          </details>
          <button
            className="button primary"
            disabled={busy || !online || !!evidenceIssue}
            onClick={() => void publish()}
          >
            {busy ? 'Wikiへ保存中…' : '確認した内容でWikiへ掲載する'}
          </button>
        </div>
      )}
      {!online && <p>通信が戻ると掲載できます。動画はこの端末に残っています。</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
