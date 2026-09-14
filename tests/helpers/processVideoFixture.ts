import type { ProcessVideoPlan } from '../../src/domain/processVideo';
import type { Recording } from '../../src/domain/types';
export const videoRecording: Recording = {
  id: 'rec-video-test',
  title: '動画掲載の動作確認（架空）',
  category: 'プロペラ',
  author: '試験者',
  createdAt: '2026-09-14T00:00:00Z',
  updatedAt: '2026-09-14T00:00:00Z',
  duration: 8,
  frames: [],
  notes: '架空の描画試験。製法の根拠には使用しない。',
  answers: [],
  status: 'recorded',
  isDemo: false,
};
const pose = { modelId: 'part', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
export const videoPlan: ProcessVideoPlan = {
  title: '検証用の工程解説',
  summary: 'これは連携の動作確認用の概念図です。',
  missingEvidence: ['実際の製法は未確認'],
  models: [
    {
      id: 'part',
      label: '試験用部材',
      shape: 'box',
      size: { x: 2, y: 1, z: 0.2 },
      color: 'teal',
      sourceIds: ['recording:note'],
    },
  ],
  scenes: ['対象を見る', '終了状態を見る'].map((title) => ({
    title,
    action: '架空の部材の表示試験',
    visual: '試験専用',
    caption: '製法ではなく描画試験',
    uncertainty: '寸法は説明用',
    sourceIds: ['recording:note'],
    seconds: 4,
    start: [pose],
    end: [pose],
  })),
};
