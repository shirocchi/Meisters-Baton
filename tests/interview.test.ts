import { describe, expect, it, vi } from 'vitest';
import { analyze, followup, generate, type ModelRequest } from '../server/ai';
import { recordingSchema } from '../server/validation';
import {
  applyInterviewTurn,
  interviewIssue,
  isCurrentQuestion,
  knowledgeAnswers,
  questionDisposition,
} from '../src/domain/interview';
import { draftArticle } from '../src/domain/core';
import { evidenceBody } from '../src/domain/wikiWorkshop';
import type { Recording } from '../src/domain/types';

import { interviewFixture } from './helpers/interviewFixture';

const extra = () => ({
  outcome: 'followup',
  message: '「ちょうどよい」の見分け方を残します。',
  question: {
    text: '「ちょうどよい」と感じたとき、面は削る前とどう変わっていましたか？',
    reason: '後輩が手を止める状態を見分けるため。',
    kind: 'judgment',
    answerQuote: 'ちょうどよい感じ',
  },
});

describe('adaptive craft interview', () => {
  it('anchors one follow-up to the saved answer and survives strict round-trip validation', async () => {
    const r = interviewFixture();
    const provider = vi.fn(async (_request: ModelRequest) => extra());
    const turn = await followup(provider, r, 'q1');
    const next = applyInterviewTurn(r, 'q1', turn);
    expect(recordingSchema.parse(next)).toEqual(next);
    expect(interviewIssue(next)).toBeUndefined();
    expect(next.analysis!.questions[1]).toMatchObject({
      followUpOf: 'q1',
      basedOnAnswerId: 'a1',
      segmentId: 's1',
    });
    expect(r.analysis!.questions).toHaveLength(1);
    expect(JSON.parse(provider.mock.calls[0][0].text).targetAnswer.text).toBe(r.answers[0].text);
  });
  it('does not ask again when enough, unknown, or not applicable and excludes missing knowledge', async () => {
    for (const outcome of ['enough', 'unknown', 'not_applicable'] as const) {
      const r = interviewFixture();
      const provider = vi.fn(async () => ({ outcome, message: '今回の確認結果', question: null }));
      const turn = await followup(provider, r, 'q1');
      const next = applyInterviewTurn(r, 'q1', turn);
      expect(await followup(provider, next, 'q1')).toEqual(turn);
      expect(provider).toHaveBeenCalledTimes(1);
      expect(knowledgeAnswers(next)).toHaveLength(outcome === 'enough' ? 1 : 0);
      expect(questionDisposition(next, next.analysis!.questions[0])).toBe(
        outcome === 'enough' ? undefined : outcome,
      );
      if (outcome !== 'enough') expect(() => draftArticle(next)).toThrow();
    }
  });
  it('rejects invented quotes, repeated questions, and incompatible stop outcomes', async () => {
    const r = interviewFixture();
    const wrongQuote = extra();
    wrongQuote.question.answerQuote = '180度';
    const duplicate = extra();
    duplicate.question.text = r.analysis!.questions[0].text;
    for (const output of [wrongQuote, duplicate, { ...extra(), outcome: 'enough' }])
      await expect(followup(async () => output, r, 'q1')).rejects.toMatchObject({
        code: 'AI_INVALID_OUTPUT',
      });
  });
  it('stops after one follow-up and never calls the model for manual, skipped or unanswered questions', async () => {
    const r = interviewFixture();
    const turn = await followup(async () => extra(), r, 'q1');
    const next = applyInterviewTurn(r, 'q1', turn);
    const q = turn.question!;
    next.answers = [
      ...next.answers,
      { ...r.answers[0], id: 'a2', questionId: q.id, text: '表面の筋が消えた。' },
    ];
    const provider = vi.fn();
    expect((await followup(provider, next, q.id)).question).toBeNull();
    expect(provider).not.toHaveBeenCalled();
    for (const source of [
      { ...r, answers: [] },
      { ...r, analysis: { ...r.analysis!, mode: 'manual' as const } },
      {
        ...r,
        analysis: {
          ...r.analysis!,
          questions: [{ ...r.analysis!.questions[0], skipped: 'unknown' as const }],
        },
      },
    ])
      await expect(followup(provider, source, 'q1')).rejects.toMatchObject({
        code: 'INVALID_INTERVIEW',
      });
    expect(provider).not.toHaveBeenCalled();
  });
  it('bounds the initial batch and the whole interview without padding questions', async () => {
    const r = interviewFixture();
    const raw = {
      summary: 'メモの確認',
      segments: r.analysis!.segments,
      limitations: [],
      questions: [],
    };
    expect((await analyze(async () => raw, r, [])).questions).toHaveLength(0);
    await expect(
      analyze(
        async () => ({
          ...raw,
          questions: Array.from({ length: 4 }, (_, i) => ({
            ...r.analysis!.questions[0],
            id: `q${i}`,
            text: `問い${i}`,
          })),
        }),
        r,
        [],
      ),
    ).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
    r.analysis!.questions = Array.from({ length: 6 }, (_, i) => ({
      ...r.analysis!.questions[0],
      id: `q${i + 1}`,
    }));
    const provider = vi.fn();
    expect((await followup(provider, r, 'q1')).question).toBeNull();
    expect(provider).not.toHaveBeenCalled();
  });
  it('refuses late results and keeps old follow-up answers out of the current draft after edits', async () => {
    const r = interviewFixture();
    const turn = await followup(async () => extra(), r, 'q1');
    const next = applyInterviewTurn(r, 'q1', turn);
    next.answers.push({
      ...r.answers[0],
      id: 'a2',
      questionId: turn.question!.id,
      text: '古い追加回答',
    });
    next.answers.push({ ...r.answers[0], id: 'a3', text: '訂正：担当者に確認を頼んだ。' });
    expect(() => applyInterviewTurn(next, 'q1', turn)).toThrow('回答が更新');
    expect(isCurrentQuestion(next, turn.question!)).toBe(false);
    expect(draftArticle(next).claims.map((c) => c.body)).toEqual(['訂正：担当者に確認を頼んだ。']);
    expect(evidenceBody(next)).not.toContain('古い追加回答');
  });
  it('persists explicit unknown states without producing an assertion', () => {
    const r = interviewFixture();
    r.analysis!.questions[0].skipped = 'unknown';
    expect(recordingSchema.parse(r).analysis!.questions[0].skipped).toBe('unknown');
    expect(knowledgeAnswers(r)).toEqual([]);
    expect(evidenceBody(r)).toContain('未確認');
    expect(() => draftArticle(r)).toThrow();
  });
  it('rejects AI drafts that cite an unknown or superseded answer', async () => {
    const r = interviewFixture();
    r.analysis!.questions[0].skipped = 'unknown';
    await expect(
      generate(
        async () => ({
          title: 'test',
          summary: '',
          tags: [],
          claims: [
            {
              id: 'c1',
              kind: 'judgment',
              title: 'test',
              body: 'test',
              evidence: [
                {
                  id: 'e1',
                  kind: 'answer',
                  recordingId: r.id,
                  answerId: 'a1',
                  time: null,
                  quote: r.answers[0].text,
                },
              ],
            },
          ],
        }),
        r,
      ),
    ).rejects.toMatchObject({ code: 'AI_INVALID_OUTPUT' });
  });
});
