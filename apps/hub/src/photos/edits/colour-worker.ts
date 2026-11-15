import { parentPort } from 'node:worker_threads';
import { z } from 'zod';
import { applyColour, COLOUR_PLAN } from './colour-pass';

export const COLOUR_REQUEST = z.strictObject({
  pixels: z.instanceof(Uint8Array),
  channels: z.int().min(3).max(4),
  plan: COLOUR_PLAN,
});

export type ColourRequest = z.infer<typeof COLOUR_REQUEST>;

parentPort?.on('message', (raw: unknown) => {
  const request = COLOUR_REQUEST.parse(raw);
  const out = applyColour(request.pixels, request.channels, request.plan);
  const { buffer } = out;
  parentPort?.postMessage(out, buffer instanceof ArrayBuffer ? [buffer] : []);
});
