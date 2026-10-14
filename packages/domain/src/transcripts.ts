import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });
const COUNT = z.int().min(0);
const SPEAKER = z.string().trim().min(1).max(120);

export const TRANSCRIPT_SOURCES = ['camera', 'plugin'] as const;

export type TranscriptSource = (typeof TRANSCRIPT_SOURCES)[number];

export const TRANSCRIPT_SOURCE_LABELS: Readonly<Record<TranscriptSource, string>> = {
  camera: 'Camera',
  plugin: 'Plugin',
};

export const TRANSCRIPT_TEXT_MAX = 4000;

export const TRANSCRIPT_LINES_MAX = 20_000;

export const TRANSCRIPT_PARTICIPANTS_MAX = 500;

export const TRANSCRIPT_RETENTION = { min: 1, max: 365, standard: 14 } as const;

export const TRANSCRIPT_DAILY_CAP_USD = { min: 0.01, max: 100, standard: 0.5 } as const;

const RETENTION_DAYS = z
  .int()
  .min(TRANSCRIPT_RETENTION.min)
  .max(TRANSCRIPT_RETENTION.max)
  .describe('How many days a camera transcript is kept after its last line');

const DAILY_CAP_USD = z
  .number()
  .min(TRANSCRIPT_DAILY_CAP_USD.min)
  .max(TRANSCRIPT_DAILY_CAP_USD.max)
  .describe('The most camera listening may spend on transcribing in one day, in US dollars');

export const TRANSCRIPT_SETTINGS = z.strictObject({
  retention_days: RETENTION_DAYS.default(TRANSCRIPT_RETENTION.standard),
  daily_cap_usd: DAILY_CAP_USD.default(TRANSCRIPT_DAILY_CAP_USD.standard),
});

export type TranscriptSettings = z.output<typeof TRANSCRIPT_SETTINGS>;

export const TRANSCRIPT_SETTINGS_CHANGE = z
  .strictObject({
    retention_days: RETENTION_DAYS.optional(),
    daily_cap_usd: DAILY_CAP_USD.optional(),
  })
  .refine((change) => change.retention_days !== undefined || change.daily_cap_usd !== undefined, {
    message: 'Change the retention or the daily cap',
  });

export type TranscriptSettingsChange = z.output<typeof TRANSCRIPT_SETTINGS_CHANGE>;

export const TRANSCRIPT_SESSION = z.strictObject({
  id: ID,
  source: z.enum(TRANSCRIPT_SOURCES),
  source_id: z.string().min(1).max(200),
  plugin_id: z.string().min(1).max(200).nullable(),
  title: z.string().min(1).max(200),
  retention_days: z.int().min(TRANSCRIPT_RETENTION.min).max(3650).nullable(),
  started_at: MOMENT,
  ended_at: MOMENT.nullable(),
  last_line_at: MOMENT.nullable(),
  line_count: COUNT,
  participants: z.array(SPEAKER).max(TRANSCRIPT_PARTICIPANTS_MAX),
});

export type TranscriptSession = z.output<typeof TRANSCRIPT_SESSION>;

export const TRANSCRIPT_LINE_INPUT = z.strictObject({
  at: MOMENT,
  ended_at: MOMENT.nullable().optional(),
  timing: z.literal('wall_clock').nullable().optional(),
  speaker_id: z.string().min(1).max(200).nullable(),
  speaker: SPEAKER,
  text: z.string().trim().min(1).max(TRANSCRIPT_TEXT_MAX),
  bot: z.boolean(),
});

export type TranscriptLineInput = z.output<typeof TRANSCRIPT_LINE_INPUT>;

export const TRANSCRIPT_LINE = TRANSCRIPT_LINE_INPUT.extend({
  id: z.int().min(1),
  session_id: ID,
});

export type TranscriptLine = z.output<typeof TRANSCRIPT_LINE>;

export const TRANSCRIPT_DETAIL = z.strictObject({
  session: TRANSCRIPT_SESSION,
  lines: z.array(TRANSCRIPT_LINE),
  more: z.boolean(),
});

export type TranscriptDetail = z.output<typeof TRANSCRIPT_DETAIL>;

export const TRANSCRIPT_HIT = z.strictObject({
  session: TRANSCRIPT_SESSION,
  line: TRANSCRIPT_LINE,
});

export type TranscriptHit = z.output<typeof TRANSCRIPT_HIT>;

export const TRANSCRIPT_PAUSE_REASONS = [
  'no_gemini_key',
  'no_openrouter_key',
  'cap_reached',
  'privacy',
  'offline',
  'in_call',
] as const;

export type TranscriptPauseReason = (typeof TRANSCRIPT_PAUSE_REASONS)[number];

export const TRANSCRIPT_PAUSE_LABELS: Readonly<Record<TranscriptPauseReason, string>> = {
  no_gemini_key: 'Needs a Gemini key in the voice settings',
  no_openrouter_key: 'Needs an OpenRouter key in the AI settings',
  cap_reached: 'Today’s transcript budget is used up',
  privacy: 'Privacy mode is on',
  offline: 'The camera is offline',
  in_call: 'A conversation is using the microphone',
};

export const TRANSCRIPT_LISTENING = z.discriminatedUnion('state', [
  z.strictObject({ camera_id: ID, state: z.literal('off') }),
  z.strictObject({ camera_id: ID, state: z.literal('listening') }),
  z.strictObject({
    camera_id: ID,
    state: z.literal('paused'),
    reason: z.enum(TRANSCRIPT_PAUSE_REASONS),
  }),
]);

export type TranscriptListening = z.output<typeof TRANSCRIPT_LISTENING>;

export const TRANSCRIPT_STATUS = z.strictObject({
  cameras: z.array(TRANSCRIPT_LISTENING),
  spent_usd: z.number().min(0),
  cap_usd: z.number().min(0),
});

export type TranscriptStatus = z.output<typeof TRANSCRIPT_STATUS>;

export function transcriptRetentionLabel(days: number): string {
  return days === 1 ? '1 day' : `${String(days)} days`;
}
