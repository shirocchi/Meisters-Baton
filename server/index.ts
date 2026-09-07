import 'dotenv/config';
import { resolve } from 'node:path';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be an integer from 1 to 65535.');
const host = process.env.HOST ?? '127.0.0.1';
const trustProxy = process.env.TRUST_PROXY_HOPS ? Number(process.env.TRUST_PROXY_HOPS) : undefined;
if (
  trustProxy !== undefined &&
  (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 10)
)
  throw new Error('TRUST_PROXY_HOPS must be a number from 0 to 10.');
const { app, close } = createApp({
  serveDir: process.env.NODE_ENV === 'production' ? resolve('dist') : undefined,
  trustProxy,
});
const server = app.listen(port, host, () =>
  console.log(`Meister's Baton API listening at http://${host}:${port}`),
);
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
