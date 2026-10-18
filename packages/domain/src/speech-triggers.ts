import { z } from 'zod';
import { LISTENING_SOURCE } from './listening';

export const SPEECH_SOURCE = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('camera'), deviceId: z.uuid() }),
  z.strictObject({ kind: z.literal('phone'), deviceId: z.uuid() }),
  z.strictObject({ kind: z.literal('computer'), deviceId: z.uuid() }),
  z.strictObject({
    kind: z.literal('plugin'),
    pluginId: z.string().min(1).max(200),
    sourceId: z.string().min(1).max(200),
  }),
  z.strictObject({ kind: z.literal('attachment'), chatId: z.uuid() }),
]);
export type SpeechSource = z.infer<typeof SPEECH_SOURCE>;
export const SPEECH_TRIGGER = z.object({
  type: z.literal('speech'),
  phrase: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((text) => /[\p{L}\p{N}]/u.test(text), 'Use at least one spoken word'),
  caseSensitive: z.boolean().default(false),
  includeBots: z.boolean().default(false),
  source: SPEECH_SOURCE.nullable().default(null),
});
export type SpeechTrigger = z.infer<typeof SPEECH_TRIGGER>;

export const SPEECH_SOURCES = z.strictObject({
  sources: z.array(
    z.strictObject({
      source: SPEECH_SOURCE,
      label: z.string(),
      listening: LISTENING_SOURCE.pick({ wake: true, transcribe: true, state: true }).nullable(),
    }),
  ),
  unavailable: z.array(z.strictObject({ kind: z.enum(['video', 'image']), reason: z.string() })),
});
