import { z } from 'zod';

const FLIP = z.union([z.literal(1), z.literal(-1)]);

export const RASTER_PAGE = z.object({
  width: z.int(),
  height: z.int(),
  dpi: z.int(),
  space: z.enum(['srgb', 'sgray']),
  pixels: z.instanceof(Uint8Array),
  pageSizeName: z.string(),
  quality: z.int(),
  copies: z.int(),
  duplex: z.boolean(),
  tumble: z.boolean(),
  transform: z.strictObject({ crossFeed: FLIP, feed: FLIP }),
});

export const RASTER_REPLY = z.union([
  z.strictObject({ bytes: z.instanceof(Uint8Array) }),
  z.strictObject({ error: z.string() }),
]);

export type RasterReply = z.infer<typeof RASTER_REPLY>;
