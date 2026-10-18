import { z } from 'zod';
import { SPEECH_VOICE } from './one-shot-speech';

export const VOICE_PREVIEW_RATE = 24_000;
export const VOICE_PREVIEW_TIMEOUT_MS = 20_000;
export const VOICE_PREVIEW_TEXT = 'Hello. This is my voice for calls in SmartEverything.';

export const VOICE_SAMPLE_PARAMS = z.strictObject({ voice: SPEECH_VOICE });
export type CallVoice = z.infer<typeof SPEECH_VOICE>;

export const VOICE_SAMPLE = z.strictObject({ audio: z.base64().min(1) });
export type VoiceSample = z.infer<typeof VOICE_SAMPLE>;
