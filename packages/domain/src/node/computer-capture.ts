import { z } from 'zod';

export const CAPTURE_TARGETS = ['screen', 'focused'] as const;

export type CaptureTarget = (typeof CAPTURE_TARGETS)[number];

export const COMPUTER_CAPTURE = z.strictObject({
  mimeType: z.literal('image/jpeg'),
  data: z.base64(),
  width: z.int().positive(),
  height: z.int().positive(),
  at: z.iso.datetime({ offset: true }),
});

export type ComputerCapture = z.infer<typeof COMPUTER_CAPTURE>;
