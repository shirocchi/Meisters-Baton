import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { textbookLocalSources } from './scripts/textbook-local-plugin.ts';
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), textbookLocalSources()],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: { sourcemap: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
