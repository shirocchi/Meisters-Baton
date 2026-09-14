import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { interviewFixture } from '../helpers/interviewFixture';
import type { Recording } from '../../src/domain/types';

async function setup(page: Page, noQuestions = false) {
  const userId = '11111111-1111-4111-8111-111111111111';
  const teamId = '22222222-2222-4222-8222-222222222222';
  const part = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: userId, aud: 'authenticated', exp: expires })}.test-signature`;
  // Local test session only. Every remote request is intercepted; no live data or tokens.
  await page.route('https://**/*', (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('team_members')
      ? { team_id: teamId, display_name: 'テスト担当', role: 'owner' }
      : path.endsWith('teams')
        ? { id: teamId, name: '検証用工房' }
        : [];
    return route.fulfill({ json: body });
  });
  await page.goto('/');
  await page.evaluate(
    async ({ token, expires, userId }) => {
      localStorage.setItem(
        'meisters-baton-supabase-auth',
        JSON.stringify({
          access_token: token,
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: expires,
          refresh_token: 'test-refresh-token',
          user: {
            id: userId,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'test@example.com',
            app_metadata: { provider: 'email' },
            user_metadata: {},
            identities: [],
            created_at: '2026-01-01T00:00:00.000Z',
          },
        }),
      );
      const url = '/src/lib/storage.ts';
      const { loadSettings, saveSettings } = await import(url);
      const settings = await loadSettings();
      await saveSettings({ ...settings, aiConsent: true, apiBaseUrl: location.origin });
    },
    { token, expires, userId },
  );
  await page.reload();
  await page.goto('/#capture');
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    const parts: Blob[] = [];
    recorder.ondataavailable = (e) => parts.push(e.data);
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start();
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 ? '#174c43' : '#d4e4d9';
      ctx.fillRect(0, 0, 320, 180);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    return Array.from(new Uint8Array(await new Blob(parts).arrayBuffer()));
  });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'interview-test.webm',
      mimeType: 'video/webm',
      buffer: Buffer.from(bytes),
    });
  await page.getByLabel(/作業の名前/).fill('質問の流れの検証');
  await page.getByLabel(/作業メモ/).fill(interviewFixture().notes);
  await page.getByRole('button', { name: '保存して、判断を残す' }).click();
  await page.route('**/api/ai/analyze', (route) =>
    route.fulfill({
      json: {
        ...interviewFixture().analysis,
        segments: [
          {
            ...interviewFixture().analysis!.segments[0],
            end: route.request().postDataJSON().recording.duration,
          },
        ],
        questions: noQuestions
          ? []
          : [
              ...interviewFixture().analysis!.questions,
              {
                id: 'q2',
                segmentId: 's1',
                text: '別の確認が必要だった条件はありましたか？',
                reason: '目安を使える条件を残すため。',
                kind: 'judgment',
              },
            ],
      },
    }),
  );
  await page.getByRole('button', { name: 'AIに映像を見てもらう' }).click();
  await expect(
    page.getByRole('heading', {
      name: noQuestions
        ? '今回の聞き取りはここまで'
        : '削るのを止めると決めた手がかりは何でしたか？',
    }),
  ).toBeVisible();
}

test('answer → one grounded follow-up → unknown → resume → draft on a phone', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
  let calls = 0;
  await page.route('**/api/ai/followup', async (route) => {
    calls++;
    const { recording, questionId } = route.request().postDataJSON() as {
      recording: Recording;
      questionId: string;
    };
    const answer = recording.answers.at(-1)!;
    expect(answer.text).toBe('ちょうどよい感じになったから。');
    await route.fulfill({
      json: {
        review: {
          answerId: answer.id,
          outcome: 'followup',
          message: '止める目安を具体的に残します。',
        },
        question: {
          id: 'followup-ui',
          segmentId: 's1',
          followUpOf: questionId,
          basedOnAnswerId: answer.id,
          answerQuote: 'ちょうどよい感じ',
          kind: 'judgment',
          text: 'そのとき、削る前と面はどう変わっていましたか？',
          reason: '後輩が手を止める状態を見分けるため。',
        },
      },
    });
  });
  await page.getByLabel('あなたの言葉で').fill('ちょうどよい感じになったから。');
  await page.getByRole('button', { name: '回答を保存して続ける' }).click();
  await expect(
    page.getByRole('heading', { name: 'そのとき、削る前と面はどう変わっていましたか？' }),
  ).toBeVisible();
  await expect(page.locator('.question-card blockquote')).toContainText('ちょうどよい感じ');
  await page
    .locator('.question-card')
    .evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: info.outputPath('interview-mobile.png'), fullPage: true });
  await page.locator('.question-card').screenshot({ path: info.outputPath('question-card.png') });
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations.map((v) => v.id)).toEqual([]);
  await page.getByLabel('あなたの言葉で').fill('面に残っていた筋が消えた。');
  await page.getByRole('button', { name: '回答を保存して次へ', exact: true }).click();
  await page.getByRole('button', { name: '分からない・覚えていない' }).click();
  await expect(page.getByRole('heading', { name: '今回の聞き取りはここまで' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '今回の聞き取りはここまで' })).toBeVisible();
  await page.getByRole('button', { name: '質問3（保留）', exact: true }).click();
  await expect(page.getByText('未確認として保留中です。分かったら回答できます。')).toBeVisible();
  await page.getByRole('button', { name: 'Wikiの下書きを作る' }).click();
  await expect(
    page.locator('.claim-body').filter({ hasText: '面に残っていた筋が消えた。' }),
  ).toBeVisible();
  expect(calls).toBe(1);
  expect(errors).toEqual([]);
});

test('AI failure preserves the answer and permits continuing without another request', async ({
  page,
}) => {
  await setup(page);
  let calls = 0;
  await page.route('**/api/ai/followup', (route) => {
    calls++;
    return route.fulfill({ status: 503, json: { error: '検証用：Codexに接続できません。' } });
  });
  await page.getByLabel('あなたの言葉で').fill('失敗しても残す回答');
  await page.getByRole('button', { name: '回答を保存して続ける' }).click();
  await expect(page.getByRole('alert')).toContainText('検証用：Codexに接続できません');
  await expect(page.locator('.interview-feedback')).toContainText('回答は端末に保存されています');
  await expect(page.getByLabel('あなたの言葉で')).toHaveValue('失敗しても残す回答');
  await page.reload();
  await page.getByRole('button', { name: '質問1', exact: true }).click();
  await expect(page.getByLabel('あなたの言葉で')).toHaveValue('失敗しても残す回答');
  await page.getByRole('button', { name: '追加質問をせず先へ' }).click();
  await expect(
    page.getByRole('heading', { name: '別の確認が必要だった条件はありましたか？' }),
  ).toBeVisible();
  expect(calls).toBe(1);
});

test('when the memo already suffices, zero questions can proceed to a cited AI draft', async ({
  page,
}) => {
  await setup(page, true);
  await page.route('**/api/ai/generate', (route) => {
    const { recording } = route.request().postDataJSON() as { recording: Recording };
    return route.fulfill({
      json: {
        title: recording.title,
        summary: 'メモからの下書き',
        tags: [],
        claims: [
          {
            id: 'memo-claim',
            title: '記録された作業',
            kind: 'step',
            body: recording.notes,
            evidence: [
              {
                id: 'memo-evidence',
                kind: 'note',
                recordingId: recording.id,
                quote: recording.notes,
              },
            ],
          },
        ],
      },
    });
  });
  await page.getByRole('button', { name: 'AIで整理して下書きにする' }).click();
  await expect(page.locator('.claim-body')).toContainText(interviewFixture().notes);
  await expect(page.getByRole('button', { name: '確認済みWikiとして公開' })).toBeDisabled();
});
