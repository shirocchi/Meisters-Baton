import type { Recording } from '../../src/domain/types';

export function interviewFixture(): Recording {
  return {
    id: 'interview-fixture',
    title: 'テスト専用：面の仕上がり確認',
    category: '工具・治具',
    author: 'テスト作業者',
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:00.000Z',
    duration: 20,
    frames: [],
    notes: 'テスト用の架空記録。木片を削り、途中で手を止めて面を見た。実際の製作記録ではない。',
    analysis: {
      mode: 'ai',
      summary: 'メモから仕上がり確認の判断を聞く',
      segments: [
        {
          id: 's1',
          start: 0,
          end: 20,
          title: '仕上がりを確認',
          observation: 'メモに、途中で手を止めて面を見たとある。',
        },
      ],
      questions: [
        {
          id: 'q1',
          segmentId: 's1',
          kind: 'judgment',
          text: '削るのを止めると決めた手がかりは何でしたか？',
          reason: '後輩が削り続けるか止めるかを判断するため。',
        },
      ],
      limitations: [],
    },
    answers: [
      {
        id: 'a1',
        questionId: 'q1',
        text: 'ちょうどよい感じになったから。',
        author: 'テスト作業者',
        createdAt: '2026-09-13T00:00:00.000Z',
        source: 'text',
      },
    ],
    status: 'interview',
    isDemo: false,
  };
}
