import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AuthSession, Settings, TeamData } from './domain/types';
import { createDemoData } from './domain';
import { loadData, loadSettings, saveData, saveSettings } from './lib/storage';
import { setAuthSession } from './lib/api';
import { isSupabaseConfigured, onSupabaseAuthChange, restoreSupabaseAuth } from './lib/supabase';
type Store = {
  data: TeamData;
  settings: Settings;
  auth: AuthSession | null;
  setAuth: (value: AuthSession | null) => void;
  mutate: (fn: (data: TeamData) => TeamData) => Promise<void>;
  configure: (patch: Partial<Settings>) => Promise<void>;
  toast: (message: string) => void;
  navigate: (path: string) => void;
  online: boolean;
};
const Context = createContext<Store | null>(null);
export const useBaton = () => {
  const value = useContext(Context);
  if (!value) throw new Error('Store missing');
  return value;
};
export function BatonProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<TeamData | null>(null);
  const dataRef = useRef<TeamData | null>(null);
  const chain = useRef(Promise.resolve());
  const [settings, setSettings] = useState<Settings | null>(null);
  const [auth, updateAuth] = useState<AuthSession | null>(null);
  const settingsRef = useRef<Settings | null>(null);
  const settingsChain = useRef(Promise.resolve());
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toast = (message: string) => {
    clearTimeout(timer.current);
    setNotice(message);
    timer.current = setTimeout(() => setNotice(''), 5000);
  };
  useEffect(() => {
    let mounted = true;
    Promise.all([loadData(), loadSettings()])
      .then(async ([saved, preferences]) => {
        const value = saved ?? createDemoData();
        if (!saved) await saveData(value);
        if (mounted) {
          dataRef.current = value;
          setData(value);
          settingsRef.current = preferences;
          setSettings(preferences);
        }
      })
      .catch(() =>
        setError(
          '端末の保存領域を開けません。プライベートブラウズを終了するか、空き容量を確認して再読み込みしてください。',
        ),
      );
    const on = () => setOnline(true),
      off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      mounted = false;
      clearTimeout(timer.current);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  useEffect(() => {
    if (!settings || !isSupabaseConfigured()) return;
    let active = true;
    const refresh = () => {
      void restoreSupabaseAuth()
        .then((next) => {
          if (!active) return;
          setAuthSession(next, settings.apiBaseUrl);
          updateAuth(next);
        })
        .catch((cause) => {
          if (!active) return;
          setAuthSession(null);
          updateAuth(null);
          setNotice(
            cause instanceof Error ? cause.message : 'ログイン状態を確認できませんでした。',
          );
        });
    };
    refresh();
    const unsubscribe = onSupabaseAuthChange(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [settings?.apiBaseUrl]);
  const mutate = (fn: (data: TeamData) => TeamData) => {
    const operation = chain.current.then(async () => {
      if (!dataRef.current) return;
      const next = fn(dataRef.current);
      await saveData(next);
      dataRef.current = next;
      setData(next);
    });
    chain.current = operation.catch(() => {});
    return operation;
  };
  const configure = async (patch: Partial<Settings>) => {
    const previous = settingsRef.current ?? settings;
    if (!previous) return;
    const next = { ...previous, ...patch };
    settingsRef.current = next;
    setSettings(next);
    const operation = settingsChain.current.then(() => saveSettings(next));
    settingsChain.current = operation.catch(() => {});
    try {
      await operation;
    } catch (error) {
      if (settingsRef.current === next) {
        settingsRef.current = previous;
        setSettings(previous);
      }
      throw error;
    }
  };
  const setAuth = (next: AuthSession | null) => {
    setAuthSession(next, settings?.apiBaseUrl ?? '');
    updateAuth(next);
  };
  if (error)
    return (
      <main className="fatal">
        <h1>保存領域を確認してください</h1>
        <p>{error}</p>
        <button onClick={() => location.reload()}>再読み込み</button>
      </main>
    );
  if (!data || !settings)
    return (
      <main className="boot">
        <img src="/icon.svg" width="58" alt="" />
        <p>工房をひらいています</p>
        <span className="spinner" />
      </main>
    );
  return (
    <Context.Provider
      value={{
        data,
        settings,
        auth,
        setAuth,
        mutate,
        configure,
        toast,
        navigate: (path) => {
          location.hash = path;
          window.scrollTo({ top: 0 });
        },
        online,
      }}
    >
      {children}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </Context.Provider>
  );
}
