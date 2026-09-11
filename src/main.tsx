import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import '@fontsource-variable/noto-sans-jp';
import '@fontsource-variable/manrope';
import { App } from './App';
import './styles.css';
import './styles-refinements.css';
// Recovered from the last verified UI-refresh deployment after its source workspace was lost.
// Scoped feature styles follow so they can extend this refreshed visual system safely.
import './styles-refresh.css';
import './styles-wiki-refresh.css';
import './styles-settings-refresh.css';
import './styles-desktop.css';
class ErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fatal">
        <img src="/icon.svg" width="64" alt="" />
        <h1>画面を開き直してください</h1>
        <p>保存済みの記録は端末に残っています。</p>
        <button onClick={() => location.reload()}>再読み込み</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
if (
  import.meta.env.PROD &&
  !Capacitor.isNativePlatform() &&
  'serviceWorker' in navigator &&
  location.protocol.startsWith('http')
)
  navigator.serviceWorker.register('/sw.js').catch(() => {});
