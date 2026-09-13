import { describe, expect, it, vi } from 'vitest';
import { writeFile, access } from 'node:fs/promises';
import { codexProvider, runCodexProcess, type Runner } from '../server/codexProvider';

const input = {
  name: 'test',
  instructions: 'fixture only',
  text: 'fixture data',
  schema: { type: 'object' },
};
describe('laptop Codex boundary', () => {
  it('waits for the child process to stop and preserves a timeout error', async () => {
    await expect(
      runCodexProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {}, '', 500),
    ).rejects.toMatchObject({ code: 'CODEX_TIMEOUT' });
  });
  it('uses isolated read-only ChatGPT execution and cleans temporary files', async () => {
    let directory = '';
    const runner: Runner = async (_exe, args, options, prompt) => {
      directory = String(options.cwd);
      expect(args).toContain('--ignore-user-config');
      expect(args).toContain('--ephemeral');
      expect(args).toContain('read-only');
      expect(args).toContain('forced_login_method="chatgpt"');
      expect(args).toContain('features.shell_tool=false');
      expect(args).toContain('features.apps=false');
      expect(options.env).not.toHaveProperty('OPENAI_API_KEY');
      expect(options.env).not.toHaveProperty('BATON_ACCESS_TOKEN');
      expect(prompt).toContain('fixture data');
      await writeFile(args[args.indexOf('--output-last-message') + 1], '{"ok":true}');
      return { code: 0, stdout: '{"type":"turn.completed"}', stderr: '' };
    };
    expect(await codexProvider({ runner })(input)).toEqual({ ok: true });
    await expect(access(directory)).rejects.toThrow();
  });
  it.each(['command_execution', 'mcp_tool_call', 'web_search', 'file_change'])(
    'rejects a %s event even when the process exits successfully',
    async (type) => {
      const runner = vi.fn(async () => ({
        code: 0,
        stderr: '',
        stdout: JSON.stringify({ type: 'item.completed', item: { type } }),
      }));
      await expect(codexProvider({ runner })(input)).rejects.toMatchObject({
        code: 'CODEX_UNEXPECTED_TOOL',
      });
    },
  );
  it('requires explicit turn completion', async () => {
    const runner = vi.fn(async () => ({ code: 0, stderr: '', stdout: '' }));
    await expect(codexProvider({ runner })(input)).rejects.toMatchObject({
      code: 'CODEX_INCOMPLETE',
    });
  });
  it('does not include private provider error output in app responses', async () => {
    const runner = vi.fn(async () => ({
      code: 1,
      stderr: 'unauthorized secret-value',
      stdout: '',
    }));
    await expect(codexProvider({ runner })(input)).rejects.toMatchObject({
      code: 'CODEX_LOGIN_REQUIRED',
    });
    await expect(codexProvider({ runner })(input)).rejects.not.toThrow('secret-value');
  });
});
