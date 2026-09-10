import { z } from 'zod';

const triplet = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const base64 = z
  .string()
  .max(8_000_000)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
const part = z
  .object({
    id: z.string(),
    group: z.string(),
    assembly: z.enum(['upper', 'under']),
    color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    min: triplet,
    scale: triplet,
    positions: base64,
    indices: base64,
  })
  .refine((p) => {
    const bytes = (s: string) =>
      (s.length * 3) / 4 - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0);
    return bytes(p.positions) > 0 && bytes(p.positions) % 6 === 0 && bytes(p.indices) % 6 === 0;
  }, 'Invalid triangle buffer');
const model = z.object({ parts: z.array(part).min(1).max(100) });
const profile = z
  .array(z.tuple([z.number().finite(), z.number().finite()]))
  .min(3)
  .max(5000);
export const atlasModelSchema = z.object({
  body: model,
  local: model,
  profile: z.object({ upper: profile, under: profile }),
});
export type AtlasModel = z.infer<typeof atlasModelSchema>;
export const atlasMetadataSchema = z.object({
  version: z.literal(1),
  modelAssetId: z.string(),
  stages: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z-]+$/),
        pageId: z.string(),
        number: z.string(),
        short: z.string(),
        model: z.enum(['blade', 'mold']),
        local: z.boolean().default(false),
        photoId: z.string(),
        photoCaption: z.string(),
        sources: z.array(z.string()),
        related: z.array(z.string()),
      }),
    )
    .min(1)
    .max(30),
});
export const protectedAssetSchema = z.object({ encoding: z.literal('base64'), data: base64 });
