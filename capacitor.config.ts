import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'jp.meisters.baton',
  appName: "Meister's Baton",
  webDir: 'dist',
  ios: { contentInset: 'never', backgroundColor: '#f5f7f6' },
  android: { backgroundColor: '#f5f7f6', allowMixedContent: false },
  plugins: { SplashScreen: { launchAutoHide: true }, Keyboard: { resize: 'body' } },
};
export default config;
