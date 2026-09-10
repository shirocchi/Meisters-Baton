import { useEffect, useRef, useState } from 'react';
import type { WikiAsset } from '../../domain/growiWiki';
import { atlasModelSchema, type AtlasModel as ModelData } from '../../domain/wikiAtlas';
import { loadWikiAsset } from '../../lib/growiWiki';
import { initBlade } from './blade.js';
import { initMold } from './mold.js';
import bladeMarkup from './blade.html?raw';
import moldMarkup from './mold.html?raw';
import './model.css';

function ModelView({
  data,
  kind,
  local,
}: {
  data: ModelData;
  kind: 'blade' | 'mold';
  local: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const root = host.current!;
    // These templates are bundled renderer markup; no remote HTML or scripts are executed.
    root.innerHTML = kind === 'blade' ? bladeMarkup : moldMarkup;
    let dispose: (() => void) | undefined;
    try {
      dispose = kind === 'blade' ? initBlade(root, data, local) : initMold(root, data.profile);
    } catch {
      setError('模型を表示できません。実写真と本文で構造をご確認ください。');
    }
    return () => {
      dispose?.();
      root.replaceChildren();
    };
  }, [data, kind, local]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div className="atlas-model" ref={host} />
    </>
  );
}

export function AtlasModel({
  asset,
  token,
  kind,
  local = false,
}: {
  asset: WikiAsset;
  token: string;
  kind: 'blade' | 'mold';
  local?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ identity: string; data?: ModelData; error?: string }>();
  const identity = `${token}:${asset.sha256}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    void loadWikiAsset(asset, token, controller.signal)
      .then((blob) => blob.text())
      .then((text) => atlasModelSchema.parse(JSON.parse(text)))
      .then((data) => {
        if (!controller.signal.aborted) setResult({ identity, data });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({
            identity,
            error: '模型を読み込めません。通信状態と閲覧権限を確認してください。',
          });
      });
    return () => controller.abort();
  }, [identity]);
  const current = result?.identity === identity ? result : undefined;
  if (current?.error)
    return (
      <div className="atlas-loading">
        <p role="alert">{current.error}</p>
        <button className="button" onClick={() => setAttempt((n) => n + 1)}>
          再試行
        </button>
      </div>
    );
  if (!current?.data)
    return (
      <p role="status" className="atlas-loading">
        模型を読み込んでいます…
      </p>
    );
  return (
    <ModelView key={`${kind}:${local}:${identity}`} data={current.data} kind={kind} local={local} />
  );
}
