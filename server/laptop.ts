import { config } from 'dotenv';
import { createLaptopGateway } from './laptopGateway';
import { codexProvider, runCodexProcess } from './codexProvider';

config({ path: '.env.local', quiet: true });
const executable = process.env.BATON_CODEX_EXECUTABLE ?? 'codex';
const status = await runCodexProcess(executable, ['login', 'status'], {}, '', 15000);
if (status.code !== 0 || !/logged in using chatgpt/i.test(status.stdout + status.stderr))
  throw Error('このPCのCodexにChatGPTでログインしてから起動してください。');
const url = process.env.VITE_SUPABASE_URL ?? '';
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
if (!url || !key) throw Error('.env.localにアプリと同じSupabaseの公開設定が必要です。');
const port = 8787;
const app = createLaptopGateway({
  url,
  key,
  teamId: process.env.BATON_ALLOWED_TEAM_ID ?? '',
  provider: codexProvider({ executable, model: process.env.BATON_CODEX_MODEL }),
  allowedOrigins: [
    'http://127.0.0.1:8787',
    'http://localhost:8787',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    'https://meisters-baton.vercel.app',
  ],
  serveDir: 'dist',
});
const server = app.listen(port, '127.0.0.1', () =>
  console.log(`Meister's Baton: http://127.0.0.1:${port} (Codex / ChatGPT, このPCのみ)`),
);
server.on('error', () => {
  console.error('起動できませんでした。8787番ポートの使用状況を確認してください。');
  process.exitCode = 1;
});
