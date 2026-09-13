import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Generated artifacts only. The source remains codex/growing-textbook / PR #22.
const root = resolve(import.meta.dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const target = 'codex/textbook-pages';
if (git('branch', '--show-current') !== 'codex/growing-textbook')
  throw Error('Use the canonical textbook branch.');
if (git('status', '--porcelain', '--untracked-files=no'))
  throw Error('Commit the source changes first.');
if (!git('remote', 'get-url', 'origin').includes('shirocchi/Meisters-Baton'))
  throw Error('This preview belongs to the shirocchi fork.');
const source = git('rev-parse', 'HEAD');
const workspace = mkdtempSync(join(tmpdir(), 'baton-pages-'));
try {
  // git archive excludes local evidence, credentials, and all ignored files.
  const archive = execFileSync('git', ['archive', 'HEAD'], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  });
  execFileSync('tar', ['-x', '-C', workspace], { input: archive });
  symlinkSync(join(root, 'node_modules'), join(workspace, 'node_modules'), 'dir');
  execFileSync('npm', ['run', 'build'], {
    cwd: workspace,
    stdio: 'inherit',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: tmpdir(),
      VITE_BASE_PATH: '/Meisters-Baton/',
    },
  });
  const output = join(workspace, 'dist');
  writeFileSync(join(output, 'preview-commit.txt'), source + '\n');
  writeFileSync(join(output, '.nojekyll'), '');
  const env = {
    ...process.env,
    GIT_INDEX_FILE: join(workspace, 'deployment-index'),
    GIT_WORK_TREE: output,
  };
  const artifactGit = (...args) =>
    execFileSync('git', args, { cwd: root, env, encoding: 'utf8' }).trim();
  artifactGit('add', '--force', '--all', '--', '.');
  const tree = artifactGit('write-tree');
  const auth = ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential'];
  const remote = git(...auth, 'ls-remote', 'origin', `refs/heads/${target}`);
  let parent = '';
  if (remote) {
    git(...auth, 'fetch', 'origin', `refs/heads/${target}`);
    parent = git('rev-parse', 'FETCH_HEAD');
  }
  const commit = artifactGit(
    '-c',
    'user.name=shirocchi',
    '-c',
    'user.email=215657530+shirocchi@users.noreply.github.com',
    'commit-tree',
    tree,
    ...(parent ? ['-p', parent] : []),
    '-m',
    `Publish textbook from ${source}`,
  );
  execFileSync('git', [...auth, 'push', 'origin', `${commit}:refs/heads/${target}`], {
    cwd: root,
    stdio: 'inherit',
  });
  console.log(
    `Published artifacts from ${source}. Source files and the current checkout are unchanged.`,
  );
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
