import type { Article, ClaimKind, Recording, TeamData } from './types';
import { makeId } from './core';

export function createEmptyData(name = '私たちの工房'): TeamData {
  return {
    schemaVersion: 1,
    workspace: { id: makeId('workspace'), name },
    recordings: [],
    articles: [],
    requests: [],
    activity: [],
  };
}

const demoDate = '2026-09-06T00:00:00.000Z';
const author = '山田先輩（架空のデモ人物）';
const disclaimer =
  'これは操作を試すための架空の教材です。映像は未添付で、画面のイラストは作業の証拠ではありません。実際の製造条件・合否基準・安全手順を示すものではありません。';

interface DemoLesson {
  slug: string;
  title: string;
  category: string;
  summary: string;
  tags: string[];
  duration: number;
  parts: { kind: ClaimKind; question: string; answer: string }[];
}

const lessons: DemoLesson[] = [
  {
    slug: 'layup',
    title: '積層前に、繊維の向きを確かめる',
    category: 'CFRP・積層',
    duration: 126,
    summary:
      '向きを決める前に何と照合し、迷ったときにどう確認するか。経験者への聞き取りを体験するデモです。',
    tags: ['CFRP', '積層', '繊維方向', '事前確認'],
    parts: [
      {
        kind: 'step',
        question: '材料を置く前に、何を照合しますか？',
        answer:
          'この架空の練習例では、材料の表示と、その作業に承認された積層指示を並べて照合します。記憶だけで向きを決めず、どの表示を見て判断したかもメモに残します。実際の向きや順序は製品ごとの指示に従って確認してください。',
      },
      {
        kind: 'judgment',
        question: '繊維方向に迷ったら、どうしますか？',
        answer:
          'デモで伝えたいのは、迷いをそのまま次の工程へ持ち込まないことです。表示や図面の読み方に迷った位置を示し、担当者へ確認します。「たぶん合っている」を合否の根拠にしません。',
      },
      {
        kind: 'warning',
        question: 'この記録だけで作業を進められますか？',
        answer:
          'いいえ。これは聞き取りアプリの説明用の回答です。材料の保管条件、保護具、使用期限、製造条件などはこの例には含まれていません。実作業の手順書と責任者の確認が必要です。',
      },
    ],
  },
  {
    slug: 'wrinkle',
    title: 'しわを見つけた場面を、言葉で残す',
    category: 'CFRP・成形準備',
    duration: 84,
    summary: '「いつもと違う」を観察・判断・確認に分けて残す、架空の振り返り例です。',
    tags: ['しわ', '観察', '成形', '確認'],
    parts: [
      {
        kind: 'judgment',
        question: 'しわを見つけたとき、何を記録しますか？',
        answer:
          'このデモでは、しわが気になった位置と、その時点の工程を先に残します。「不良だった」と結論を急がず、見えた状態と自分の解釈を分けて記録します。この文章はしわの合否基準ではありません。',
      },
      {
        kind: 'step',
        question: '後から確認する人へ、どう引き継ぎますか？',
        answer:
          '架空の練習では、気になる場所を示して、直前に行った作業と未確認の点を伝えます。修正方法を自己判断で決めず、該当する現場の手順と担当者の判断を確認する、という会話を残しています。',
      },
    ],
  },
  {
    slug: 'handover',
    title: '作業の終わりに、未確認を渡す',
    category: '引き継ぎ',
    duration: 98,
    summary: '終わった作業と、次の人に確かめてほしいことを一緒に残すデモです。',
    tags: ['引き継ぎ', 'チェック', '記録'],
    parts: [
      {
        kind: 'step',
        question: '作業の終わりに、何を伝えますか？',
        answer:
          'この架空の例では、実施した範囲、確認した資料、まだ確認できていないことを分けて伝えます。完了と言える根拠がそろっていない場合は、その状態を明記して引き継ぎます。',
      },
      {
        kind: 'judgment',
        question: '次の担当者が迷わないための手がかりは？',
        answer:
          'デモでは、誰の回答で、いつ記録した内容なのかを一緒に残します。条件が変わったときに古い記録をそのまま適用しないよう、どの条件の話だったかを本人に聞き直せる形にします。',
      },
    ],
  },
];

/** Deterministic, visibly fictional fixtures. No real workshop evidence or media is implied. */
export function createDemoData(): TeamData {
  const data = createEmptyData();
  for (const lesson of lessons) {
    const recordingId = `demo_recording_${lesson.slug}`;
    const segmentId = `demo_segment_${lesson.slug}`;
    const recording: Recording = {
      id: recordingId,
      title: lesson.title,
      category: lesson.category,
      author,
      createdAt: demoDate,
      updatedAt: demoDate,
      duration: lesson.duration,
      frames: [],
      notes: disclaimer,
      status: 'published',
      isDemo: true,
      analysis: {
        mode: 'demo',
        summary: lesson.summary,
        segments: [
          {
            id: segmentId,
            start: 0,
            end: lesson.duration,
            title: '架空の聞き取り例',
            observation: disclaimer,
          },
        ],
        questions: lesson.parts.map((part, i) => ({
          id: `demo_question_${lesson.slug}_${i}`,
          segmentId,
          text: part.question,
          reason: '架空の回答を使い、根拠から知識を残す流れを体験します。',
          kind: part.kind,
        })),
        limitations: [disclaimer, '事前に用意したデモです。AIによる解析結果ではありません。'],
      },
      answers: lesson.parts.map((part, i) => ({
        id: `demo_answer_${lesson.slug}_${i}`,
        questionId: `demo_question_${lesson.slug}_${i}`,
        text: part.answer,
        author,
        createdAt: demoDate,
        source: 'text',
      })),
    };
    const article: Article = {
      id: `demo_article_${lesson.slug}`,
      recordingId,
      title: lesson.title,
      category: lesson.category,
      summary: lesson.summary,
      tags: lesson.tags,
      author,
      createdAt: demoDate,
      updatedAt: demoDate,
      status: 'published',
      isDemo: true,
      bookmarked: false,
      claims: lesson.parts.map((part, i) => ({
        id: `demo_claim_${lesson.slug}_${i}`,
        kind: part.kind,
        title: part.question,
        body: part.answer,
        evidence: [
          {
            id: `demo_evidence_${lesson.slug}_${i}`,
            kind: 'answer',
            recordingId,
            answerId: `demo_answer_${lesson.slug}_${i}`,
            quote: part.answer,
          },
        ],
        review: 'confirmed',
        reviewedBy: 'デモ確認者（架空）',
        reviewedAt: demoDate,
      })),
      revisions: [],
    };
    article.revisions = [
      {
        id: `demo_revision_${lesson.slug}`,
        number: 1,
        createdAt: demoDate,
        author: 'デモ確認者（架空）',
        title: article.title,
        summary: article.summary,
        claims: structuredClone(article.claims),
        reason: '操作説明用の架空の公開例。実在する人の承認ではありません。',
      },
    ];
    data.recordings.push(recording);
    data.articles.push(article);
  }
  return data;
}
