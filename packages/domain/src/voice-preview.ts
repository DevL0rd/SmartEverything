import { z } from 'zod';
import { SPEECH_VOICE } from './one-shot-speech';

export const VOICE_PREVIEW_SECONDS = 8;
export const VOICE_PREVIEW_RATE = 24_000;
export const VOICE_PREVIEW_BYTES = VOICE_PREVIEW_RATE * 2 * VOICE_PREVIEW_SECONDS;
export const VOICE_PREVIEW_TIMEOUT_MS = 20_000;
export const VOICE_PREVIEW_VERSION = 1;
export const VOICE_PREVIEW_TEXT = 'Hello. This is my voice for calls in SmartEverything.';

export const VOICE_PREVIEW_REQUEST = z.strictObject({
  requestId: z.uuid(),
  generation: z.int().positive(),
  voice: SPEECH_VOICE,
});
export type VoicePreviewRequest = z.infer<typeof VOICE_PREVIEW_REQUEST>;

export const VOICE_PREVIEW_CANCEL = VOICE_PREVIEW_REQUEST.omit({ voice: true });
export type VoicePreviewCancel = z.infer<typeof VOICE_PREVIEW_CANCEL>;

export const VOICE_PREVIEW = z.strictObject({
  requestId: z.uuid(),
  voice: SPEECH_VOICE,
  model: z.string().min(1).max(120),
  version: z.literal(VOICE_PREVIEW_VERSION),
  mime: z.literal('audio/wav'),
  audio: z
    .base64()
    .min(1)
    .max(Math.ceil(((VOICE_PREVIEW_BYTES + 44) * 4) / 3)),
});
export type VoicePreview = z.infer<typeof VOICE_PREVIEW>;
