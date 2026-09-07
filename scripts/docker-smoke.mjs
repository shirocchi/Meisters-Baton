import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runId = randomUUID().replaceAll('-', '');
const image = `meisters-baton-smoke:${runId}`;
const container = `baton-smoke-container-${runId}`;
const volume = `baton-smoke-data-${runId}`;
const resourceLabel = `io.meisters-baton.smoke-run=${runId}`;
const credentials = {
  email: `docker-smoke-${runId}@example.invalid`,
  password: randomBytes(30).toString('base64url'),
};
let imageCreated = false;
let volumeCreated = false;
let containerCreated = false;

// Commands receive argument arrays, never shell text. HTTP credentials never enter command arguments.
function docker(args, { visible = false, timeout = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      cwd: root,
      shell: false,
      stdio: visible ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    if (!visible) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      // Drain errors without printing raw diagnostics that could contain application request data.
      child.stderr.on('data', () => undefined);
    }
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Docker ${args[0]} timed out.`));
    }, timeout);
    child.once('error', () => {
      clearTimeout(timer);
      reject(new Error('Docker could not be started. A working Docker Engine is required.'));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`Docker ${args[0]} failed (exit ${code ?? 'unknown'}).`));
      else resolve(stdout.trim());
    });
  });
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function launch() {
  await docker([
    'run',
    '--detach',
    '--name',
    container,
    '--label',
    resourceLabel,
    '--publish',
    '127.0.0.1::8787',
    '--mount',
    `type=volume,source=${volume},target=/app/.data`,
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--pids-limit',
    '128',
    '--memory',
    '1g',
    '--init',
    '--health-interval',
    '2s',
    '--health-start-period',
    '3s',
    '--health-timeout',
    '4s',
    '--env',
    'OPENAI_API_KEY=',
    image,
  ]);
  containerCreated = true;
  const port = await docker(['port', container, '8787/tcp']);
  const match = /^127\.0\.0\.1:(\d+)$/.exec(port);
  check(match, 'The smoke-test port must bind only to loopback.');
  const base = `http://127.0.0.1:${match[1]}`;
  const deadline = Date.now() + 90_000;
  let ready = false;
  while (Date.now() < deadline) {
    const state = await docker(['inspect', '--format', '{{.State.Status}}', container]);
    check(state === 'running', 'The container exited before becoming healthy.');
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3000) });
      const health = await response.json();
      const status = await docker(['inspect', '--format', '{{.State.Health.Status}}', container]);
      if (
        response.ok &&
        health.ok === true &&
        health.aiConfigured === false &&
        status === 'healthy'
      ) {
        ready = true;
        break;
      }
    } catch {
      /* A cold container may not be listening yet. */
    }
    await delay(500);
  }
  check(ready, 'The API and Docker healthcheck did not become healthy within 90 seconds.');
  await docker([
    'exec',
    container,
    'node',
    '-e',
    'if(typeof process.getuid!=="function"||process.getuid()===0)process.exit(1)',
  ]);
  return base;
}

async function api(base, endpoint, { method = 'GET', body, token, status = 200 } = {}) {
  const response = await fetch(`${base}${endpoint}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  check(response.status === status, `${method} ${endpoint} returned an unexpected status.`);
  const json = await response.json();
  return json;
}

async function stopAndRemove() {
  await docker(['stop', '--time', '15', container], { timeout: 30_000 });
  const exitCode = await docker(['inspect', '--format', '{{.State.ExitCode}}', container]);
  check(exitCode === '0', 'The API did not exit cleanly on SIGTERM.');
  await docker(['rm', container]);
  containerCreated = false;
}

async function cleanup() {
  const failures = [];
  for (const [needed, args] of [
    [containerCreated, ['rm', '--force', container]],
    [volumeCreated, ['volume', 'rm', volume]],
    [imageCreated, ['image', 'rm', image]],
  ]) {
    if (!needed) continue;
    try {
      await docker(args);
    } catch {
      failures.push(args[0]);
    }
  }
  check(
    failures.length === 0,
    'Smoke-test resource cleanup failed. Inspect resources carrying the io.meisters-baton.smoke-run label.',
  );
}

let failure;
try {
  console.log('Docker smoke: checking the container engine.');
  await docker(['info', '--format', '{{.ServerVersion}}']);
  console.log('Docker smoke: building the repository Dockerfile.');
  await docker(['build', '--tag', image, '--label', resourceLabel, '--file', 'Dockerfile', '.'], {
    visible: true,
    timeout: 12 * 60_000,
  });
  imageCreated = true;
  await docker(['volume', 'create', '--label', resourceLabel, volume]);
  volumeCreated = true;
  let base = await launch();
  console.log('Docker smoke: non-root process and image healthcheck passed.');

  const page = await fetch(base, { signal: AbortSignal.timeout(10_000) });
  const html = await page.text();
  check(
    page.ok && /id=["']root["']/.test(html) && !html.includes('/src/main.tsx'),
    'The image did not serve the built application.',
  );
  await api(base, '/api/sync', { status: 401 });
  const registered = await api(base, '/api/auth/register', {
    method: 'POST',
    status: 201,
    body: { ...credentials, name: 'Docker試験用の架空ユーザー', teamName: 'Docker永続化試験' },
  });
  check(
    typeof registered.token === 'string' && registered.user?.id,
    'Registration did not create a session.',
  );
  const token = registered.token;
  const initial = await api(base, '/api/sync', { token });
  check(
    initial.version === 0 && initial.data?.recordings?.length === 0,
    'The newly created volume was not empty.',
  );
  const now = new Date().toISOString();
  const record = {
    id: `docker-record-${runId}`,
    title: 'コンテナ再作成の永続化試験',
    category: '架空の試験記録',
    author: 'Docker試験用の架空ユーザー',
    createdAt: now,
    updatedAt: now,
    duration: 0,
    frames: [],
    notes: '自動試験の架空データ。実作業や映像の根拠ではありません。',
    answers: [],
    status: 'recorded',
    isDemo: false,
  };
  const saved = await api(base, '/api/sync', {
    method: 'PUT',
    token,
    body: { version: initial.version, data: { ...initial.data, recordings: [record] } },
  });
  check(
    saved.version === 1 && saved.data.recordings[0]?.notes === record.notes,
    'A recording was not saved through the sync endpoint.',
  );

  // A real 1px PNG exercises the private media directory; it is never presented as craft evidence.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ2QAAAAASUVORK5CYII=',
    'base64',
  );
  const uploadBody = new FormData();
  uploadBody.set('file', new Blob([png], { type: 'image/png' }), 'synthetic-smoke-pixel.png');
  const uploaded = await fetch(`${base}/api/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: uploadBody,
    signal: AbortSignal.timeout(10_000),
  });
  check(uploaded.status === 201, 'The non-root process could not persist private media.');
  const { id: mediaId } = await uploaded.json();
  check(
    typeof mediaId === 'string' && /^[\w.:-]+$/.test(mediaId),
    'The media upload did not return a usable reference.',
  );
  console.log(
    'Docker smoke: account, recording and private media saved in a fresh isolated volume.',
  );

  await stopAndRemove();
  base = await launch();
  const loggedIn = await api(base, '/api/auth/login', { method: 'POST', body: credentials });
  check(
    typeof loggedIn.token === 'string' && loggedIn.user?.id === registered.user.id,
    'Account credentials did not survive container recreation.',
  );
  const restored = await api(base, '/api/sync', { token: loggedIn.token });
  check(
    restored.version === 1 && restored.data.recordings.length === 1,
    'The sync version or record count did not survive container recreation.',
  );
  check(
    restored.data.recordings[0].id === record.id &&
      restored.data.recordings[0].notes === record.notes,
    'The recorded content did not survive container recreation.',
  );
  const downloaded = await fetch(`${base}/api/media/${mediaId}`, {
    headers: { Authorization: `Bearer ${loggedIn.token}` },
    signal: AbortSignal.timeout(10_000),
  });
  check(
    downloaded.ok && Buffer.from(await downloaded.arrayBuffer()).equals(png),
    'Private media did not survive container recreation.',
  );
  const continued = await api(base, '/api/sync', {
    method: 'PUT',
    token: loggedIn.token,
    body: { version: restored.version, data: restored.data },
  });
  check(
    continued.version === 2,
    'The recreated non-root container could not continue writing to the volume.',
  );
  console.log(
    'Docker smoke: login, SQLite state, media bytes and continued writes survived container recreation.',
  );
  await stopAndRemove();
} catch (error) {
  failure =
    error instanceof Error ? error.message : 'An unexpected Docker smoke-test error occurred.';
} finally {
  try {
    await cleanup();
  } catch (error) {
    failure ??= error instanceof Error ? error.message : 'Cleanup failed.';
  }
}

if (failure) {
  // No response bodies, generated passwords or session tokens are printed.
  console.error(`Docker smoke failed: ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Docker smoke passed. The isolated containers, volume and image were removed.');
}
