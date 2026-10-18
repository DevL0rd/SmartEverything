import { z } from 'zod';
import { CLIENT_PLATFORM } from './api/primitives';
import { PHONE_CONTEXT } from './phones';
import { PLUGIN_ORIGIN } from './plugin-people';

const ID = z.uuid();

const MOMENT = z.iso.datetime({ offset: true });

export const OUTREACH_HOWS = ['phone', 'desktop', 'app', 'camera', 'channel', 'message'] as const;

export type OutreachHow = (typeof OUTREACH_HOWS)[number];

export const OUTREACH_STATES = [
  'ringing',
  'live',
  'ended',
  'missed',
  'declined',
  'failed',
  'sent',
] as const;

export type OutreachState = (typeof OUTREACH_STATES)[number];

export const OPEN_OUTREACH_STATES: ReadonlySet<OutreachState> = new Set(['ringing', 'live']);

export const OUTREACH_REASON_MAX = 500;

export const OUTREACH_RING_SECONDS = 45;

export const AI_OUTREACH_ROW = z.object({
  id: ID,
  profile_id: ID,
  chat_id: ID.nullable(),
  from_chat_id: ID.nullable(),
  how: z.enum(OUTREACH_HOWS),
  target: z.string().min(1),
  target_label: z.string().min(1),
  reason: z.string().min(1),
  urgent: z.boolean(),
  state: z.enum(OUTREACH_STATES),
  detail: z.string().nullable(),
  call_id: ID.nullable(),
  client_id: ID.nullable(),
  clients: z.array(ID).default([]),
  origin: PLUGIN_ORIGIN.nullable().default(null),
  created_at: MOMENT,
  answered_at: MOMENT.nullable(),
  ended_at: MOMENT.nullable(),
  expires_at: MOMENT.nullable(),
});

export type AiOutreachRow = z.infer<typeof AI_OUTREACH_ROW>;

const CLOCK_TEXT = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'a time like 22:30');

export const QUIET_HOURS = z.strictObject({
  from: CLOCK_TEXT.describe('Start of quiet hours, HH:MM in the home’s time zone'),
  to: CLOCK_TEXT.describe('End of quiet hours, HH:MM; earlier than from means overnight'),
  urgent: z.boolean().describe('Let urgent calls and messages through during quiet hours'),
});

export type QuietHours = z.infer<typeof QUIET_HOURS>;

const WAKE_OFF = z
  .array(ID)
  .max(100)
  .describe('Allowed cameras that do not listen for the AI name; every other allowed camera does');

export const REACH_SETTINGS = z.object({
  quiet: QUIET_HOURS.nullable(),
  cameras: z.array(ID).max(100),
  wakeOff: WAKE_OFF.default([]),
});

export type ReachSettings = z.infer<typeof REACH_SETTINGS>;

export const REACH_SETTINGS_CHANGE = z
  .strictObject({
    personId: ID.optional().describe('Whose quiet hours; your own when left out'),
    quiet: QUIET_HOURS.nullable().optional(),
    cameras: z.array(ID).max(100).optional(),
    wakeOff: WAKE_OFF.optional(),
  })
  .refine(
    (change) =>
      change.quiet !== undefined || change.cameras !== undefined || change.wakeOff !== undefined,
    { message: 'Change the quiet hours, the cameras or which cameras listen for the name' },
  );

export type ReachSettingsChange = z.output<typeof REACH_SETTINGS_CHANGE>;

const PRESENCE_APP = z.object({
  clientId: ID,
  name: z.string(),
  platform: CLIENT_PLATFORM,
  connected: z.boolean(),
  lastSeenAt: MOMENT.nullable(),
});

const PRESENCE_ROOM = z.object({
  deviceId: ID,
  device: z.string(),
  room: z.string().nullable(),
  seen: z.enum(['person', 'motion']),
  at: MOMENT,
  minutesAgo: z.int().min(0),
});

const PRESENCE_PLACE = z.object({ id: z.string(), name: z.string() });

export const REACH_PRESENCE = z.object({
  personId: ID,
  name: z.string(),
  quietNow: z.boolean(),
  quiet: QUIET_HOURS.nullable(),
  apps: z.array(PRESENCE_APP),
  phone: PHONE_CONTEXT.nullable(),
  lastActivityInHome: PRESENCE_ROOM.nullable(),
  cameras: z.array(PRESENCE_PLACE.extend({ room: z.string().nullable() })),
  channels: z.array(PRESENCE_PLACE),
  open: z.array(AI_OUTREACH_ROW),
});

export type ReachPresence = z.infer<typeof REACH_PRESENCE>;

export const AI_SPEECH_AUDIO_MAX = 1_500_000;

export const AI_SPEECH_NOTICE = z.object({
  type: z.literal('ai_speech'),
  id: ID,
  from: z.string().min(1),
  text: z.string().min(1),
  audio: z.base64(),
  showText: z.boolean().optional(),
});

export type AiSpeechNotice = z.infer<typeof AI_SPEECH_NOTICE>;

export const AI_SPEECH_FETCH_SECONDS = 20;

export const AI_SPEECH_PUSH = z.object({ id: ID, expiresAt: MOMENT });

export type AiSpeechPush = z.infer<typeof AI_SPEECH_PUSH>;
