import { z } from 'zod';

export const AUTOMATION_SPEECH_CAPABILITY = 'automation_speech_v1';
export const AUTOMATION_SPEECH_ACCEPT = 'application/vnd.smarteverything.automation-speech+json';
export const SPEECH_SOURCE = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('camera'), deviceId: z.uuid() }),
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
  sources: z.array(z.strictObject({ source: SPEECH_SOURCE, label: z.string() })),
  unavailable: z.array(z.strictObject({ kind: z.enum(['video', 'image']), reason: z.string() })),
});
