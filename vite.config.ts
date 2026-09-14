import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { textbookLocalSources } from './scripts/textbook-local-plugin.ts';
import { realpathSync } from 'node:fs';
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react(), textbookLocalSources()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8787' },
    // Worktrees can share dependencies through a junction. Serve only the required font roots.
    fs: {
      allow: [
        '.',
        ...['manrope', 'noto-sans-jp'].map((name) =>
          realpathSync(`node_modules/@fontsource-variable/${name}`),
        ),
      ],
    },
  },
  build: { sourcemap: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
