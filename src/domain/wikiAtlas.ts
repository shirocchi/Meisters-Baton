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
const cadPoint = z.tuple([z.number().finite(), z.number().finite()]);
const cadPath = z.array(cadPoint).min(2).max(1600);
const cadMold = z.object({
  sections: z
    .array(
      z.object({
        span: z.number().finite(),
        outline: cadPath,
        product: cadPath,
      }),
    )
    .min(2)
    .max(60),
});
export const atlasManufacturingSchema = z.object({
  units: z.literal('mm'),
  molds: z.object({ upper: cadMold, under: cadMold }),
  jigs: z.object({
    web: z.object({ paths: z.array(cadPath).min(1).max(16), slot: cadPath.optional() }),
    join: z.object({
      supportPaths: z.array(cadPath).min(1).max(16),
      pressPaths: z.array(cadPath).min(1).max(16),
      upperContact: cadPath.optional(),
      underContact: cadPath.optional(),
    }),
  }),
});
export const atlasModelSchema = z.object({
  body: model,
  local: model,
  profile: z.object({ upper: profile, under: profile }),
  manufacturing: atlasManufacturingSchema.optional(),
});
export type AtlasModel = z.infer<typeof atlasModelSchema>;
const visualSection = z.object({
  heading: z.string(),
  stage: z.string().optional(),
  step: z.number().int().min(0).max(30),
  photoId: z.string().optional(),
});
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
        sections: z.array(visualSection).optional(),
      }),
    )
    .min(1)
    .max(30),
  details: z
    .array(
      z.object({
        pageId: z.string(),
        stageId: z.string(),
        step: z.number().int().min(0).max(30).optional(),
        sections: z.array(visualSection).optional(),
        photoId: z.string().optional(),
        sources: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  paintAssetId: z.string().optional(),
});
export const protectedAssetSchema = z.object({ encoding: z.literal('base64'), data: base64 });
