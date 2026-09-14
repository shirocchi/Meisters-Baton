import type { ExpertAnswer, InterviewQuestion, InterviewTurn, Recording } from './types';

export const MAX_INITIAL_QUESTIONS = 3;
export const MAX_INTERVIEW_QUESTIONS = 6;

export function latestAnswer(recording: Recording, questionId: string) {
  return recording.answers.filter((a) => a.questionId === questionId).at(-1);
}

export function questionDisposition(recording: Recording, question: InterviewQuestion) {
  if (question.skipped) return question.skipped;
  if (
    question.review?.answerId === latestAnswer(recording, question.id)?.id &&
    (question.review?.outcome === 'unknown' || question.review?.outcome === 'not_applicable')
  )
    return question.review.outcome;
}

export function isCurrentQuestion(recording: Recording, question: InterviewQuestion) {
  return (
    !question.followUpOf ||
    (!recording.analysis?.questions.find((q) => q.id === question.followUpOf)?.skipped &&
      latestAnswer(recording, question.followUpOf)?.id === question.basedOnAnswerId)
  );
}

export function knowledgeAnswers(recording: Recording): ExpertAnswer[] {
  return (recording.analysis?.questions ?? []).flatMap((q) => {
    const answer = latestAnswer(recording, q.id);
    if (!answer?.text.trim() || q.skipped || !isCurrentQuestion(recording, q)) return [];
    if (
      q.review?.answerId === answer.id &&
      ['unknown', 'not_applicable'].includes(q.review.outcome)
    )
      return [];
    return [answer];
  });
}

export function interviewIssue(recording: Recording): string | undefined {
  const questions = recording.analysis?.questions ?? [];
  for (const q of questions) {
    if (
      q.review &&
      !recording.answers.some((a) => a.id === q.review!.answerId && a.questionId === q.id)
    )
      return '質問の確認結果に対応する回答がありません。';
    if (q.followUpOf) {
      const parent = questions.find((p) => p.id === q.followUpOf);
      const answer = recording.answers.find(
        (a) => a.id === q.basedOnAnswerId && a.questionId === q.followUpOf,
      );
      if (
        !parent ||
        parent.followUpOf ||
        parent.segmentId !== q.segmentId ||
        !answer ||
        !q.answerQuote?.trim() ||
        !answer.text.includes(q.answerQuote)
      )
        return '追加質問の場面・回答・引用が元の記録と一致しません。';
    } else if (q.basedOnAnswerId || q.answerQuote) return '追加質問の元の問いがありません。';
  }
  const parents = questions.flatMap((q) => (q.followUpOf ? [q.followUpOf] : []));
  if (new Set(parents).size !== parents.length) return '同じ問いへの追加質問が重複しています。';
}

/** Apply only to the exact answer that was reviewed; preserve newer local data. */
export function applyInterviewTurn(
  recording: Recording,
  questionId: string,
  turn: InterviewTurn,
): Recording {
  const analysis = recording.analysis;
  const question = analysis?.questions.find((q) => q.id === questionId);
  if (
    !analysis ||
    !question ||
    question.skipped ||
    latestAnswer(recording, questionId)?.id !== turn.review.answerId
  )
    throw new Error('回答が更新されたため、古い追加質問を保存しませんでした。');
  if ((turn.review.outcome === 'followup') !== !!turn.question)
    throw new Error('追加質問の結果が一致しません。');
  if (
    question.review?.answerId === turn.review.answerId &&
    JSON.stringify(question.review) === JSON.stringify(turn.review) &&
    (!turn.question ||
      analysis.questions.some((q) => JSON.stringify(q) === JSON.stringify(turn.question)))
  )
    return recording;
  if (
    turn.question &&
    (turn.question.followUpOf !== questionId ||
      turn.question.basedOnAnswerId !== turn.review.answerId ||
      question.followUpOf ||
      analysis.questions.some((q) => q.id === turn.question!.id || q.followUpOf === questionId) ||
      analysis.questions.length >= MAX_INTERVIEW_QUESTIONS)
  )
    throw new Error('追加質問の上限または参照が不正です。');
  const questions = analysis.questions.flatMap((q) =>
    q.id === questionId
      ? [{ ...q, review: turn.review }, ...(turn.question ? [turn.question] : [])]
      : [q],
  );
  const next = { ...recording, analysis: { ...analysis, questions } };
  const issue = interviewIssue(next);
  if (issue) throw new Error(issue);
  return next;
}
