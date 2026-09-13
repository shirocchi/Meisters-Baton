import { useEffect, useState } from 'react';
import publishedPhotos from '../../data/bookPhotoSources.json';
import type { BookSources } from '../../domain/bookSources';
const published: BookSources = {
  version: publishedPhotos.version,
  stages: Object.fromEntries(
    Object.entries(publishedPhotos.stages).map(([id, stage]) => [
      id,
      {
        ...stage,
        practice: stage.practice.map((practice) => ({
          ...practice,
          media: practice.media.map((media) => ({
            ...media,
            localUrl: `${import.meta.env.BASE_URL}${media.asset}`,
          })),
        })),
      },
    ]),
  ),
} as BookSources;
export function useBookSources() {
  const [state, setState] = useState<{ data?: BookSources; loading: boolean; error: string }>({
    data: import.meta.env.DEV ? undefined : published,
    loading: import.meta.env.DEV,
    error: '',
  });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const abort = new AbortController();
    fetch('/__textbook/sources', { signal: abort.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw Error('資料が未接続です');
        const data = (await response.json()) as BookSources & { localArchive?: boolean };
        if (data.version !== 1 || !data.stages) throw Error('資料の形式を確認してください');
        setState({ data: data.localArchive ? published : data, loading: false, error: '' });
      })
      .catch((error) => {
        if (!abort.signal.aborted) setState({ data: published, loading: false, error: '' });
      });
    return () => abort.abort();
  }, []);
  return state;
}
