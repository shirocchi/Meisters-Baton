import { z } from 'zod';

const text = z.string().min(1).max(3000);
const vector = z
  .object({
    x: z.number().min(-4).max(4),
    y: z.number().min(-4).max(4),
    z: z.number().min(-4).max(4),
  })
  .strict();
const pose = z
  .object({ modelId: z.string().min(1).max(80), position: vector, rotation: vector })
  .strict();
export const processVideoPlanSchema = z
  .object({
    title: text,
    summary: text,
    models: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            label: z.string().min(1).max(40),
            shape: z.enum(['box', 'ellipsoid', 'cylinder', 'blade']),
            size: z
              .object({
                x: z.number().min(0.03).max(4),
                y: z.number().min(0.03).max(4),
                z: z.number().min(0.03).max(4),
              })
              .strict(),
            color: z.enum(['teal', 'sand', 'slate', 'orange']),
            sourceIds: z.array(z.string().min(1).max(180)).min(1).max(12),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    scenes: z
      .array(
        z
          .object({
            title: text,
            action: text,
            visual: text,
            caption: z.string().min(1).max(120),
            sourceIds: z.array(z.string().min(1).max(180)).min(1).max(12),
            uncertainty: text,
            seconds: z.number().int().min(4).max(15),
            start: z.array(pose).min(1).max(8),
            end: z.array(pose).min(1).max(8),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    missingEvidence: z.array(text).max(20),
  })
  .strict();
export type ProcessVideoPlan = z.infer<typeof processVideoPlanSchema>;
export function processVideoPlanIssue(plan: ProcessVideoPlan): string | undefined {
  const ids = plan.models.map((m) => m.id);
  if (new Set(ids).size !== ids.length) return 'モデルIDが重複しています。';
  for (let i = 0; i < plan.scenes.length; i++) {
    const scene = plan.scenes[i];
    for (const poses of [scene.start, scene.end]) {
      if (
        poses.length !== ids.length ||
        new Set(poses.map((p) => p.modelId)).size !== ids.length ||
        poses.some((p) => !ids.includes(p.modelId))
      )
        return '場面の部材が一致していません。';
    }
    if (i)
      for (const pose of scene.start) {
        const previous = plan.scenes[i - 1].end.find((p) => p.modelId === pose.modelId)!;
        for (const kind of ['position', 'rotation'] as const)
          for (const axis of ['x', 'y', 'z'] as const)
            if (Math.abs(previous[kind][axis] - pose[kind][axis]) > 0.0001)
              return '場面の前後で部材が不連続です。';
      }
  }
}
export interface WikiConnection {
  verifiedAt: string;
  teamId: string;
  userId: string;
  importedPages: number;
  editedPages: number | null;
  appArticles: number | null;
  matchedPages: number;
  attachment: { status: 'verified' | 'unavailable'; sha256?: string; bytes?: number };
  aiConfigured: boolean;
}
export interface ProcessVideoRun {
  id: string;
  createdAt: string;
  recordingId: string;
  teamId: string;
  skillSha256: string;
  status: 'storyboard-draft';
  plan: ProcessVideoPlan;
  sources: { id: string; title: string; route: string; sha256: string }[];
  limitations: string[];
}
