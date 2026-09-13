import { useEffect, useState } from 'react';
import type { BookSources } from '../../domain/bookSources';
export function useBookSources() {
  const [state, setState] = useState<{ data?: BookSources; loading: boolean; error: string }>({
    loading: import.meta.env.DEV,
    error: import.meta.env.DEV ? '' : '資料が未接続です',
  });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const abort = new AbortController();
    fetch('/__textbook/sources', { signal: abort.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw Error('資料が未接続です');
        const data = (await response.json()) as BookSources;
        if (data.version !== 1 || !data.stages) throw Error('資料の形式を確認してください');
        setState({ data, loading: false, error: '' });
      })
      .catch((error) => {
        if (!abort.signal.aborted) setState({ loading: false, error: error.message });
      });
    return () => abort.abort();
  }, []);
  return state;
}
