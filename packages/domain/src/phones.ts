import { z } from 'zod';
import { NODE_REPORT } from './node/report';
import { WATCH_ACTION_RESULT } from './watch-control';

export const PHONE_CONTEXT_STATES = [
  'unknown',
  'still',
  'walking',
  'running',
  'cycling',
  'driving',
  'navigating',
  'parked',
] as const;

export type PhoneContextState = (typeof PHONE_CONTEXT_STATES)[number];

export const PHONE_RINGER_MODES = ['normal', 'vibrate', 'silent'] as const;

export const PHONE_NETWORKS = ['wifi', 'cellular', 'ethernet', 'other', 'offline'] as const;

export const PHONE_PLAYBACK = ['playing', 'paused', 'stopped'] as const;

export const PHONE_VOLUME_STREAMS = ['media', 'ring', 'alarm', 'notification'] as const;

export const PHONE_FLASHLIGHT_MODES = ['on', 'off', 'toggle'] as const;

export const PHONE_MEDIA_KEYS = ['play', 'pause', 'next', 'previous'] as const;

export const PHONE_CONTEXT_STATE = z.enum(PHONE_CONTEXT_STATES);

const PERCENT = z.int().min(0).max(100);

export const PHONE_PLACE_NAME = z.string().trim().min(1).max(120);

const MINUTES_PER_DAY = 1440;

const NOW_PLAYING_LONGEST = 300;

export const PHONE_VALUES = z
  .strictObject({
    battery: PERCENT,
    charging: z.boolean(),
    network: z.enum(PHONE_NETWORKS),
    ringer_mode: z.enum(PHONE_RINGER_MODES),
    dnd: z.boolean(),
    volume: PERCENT,
    playback: z.enum(PHONE_PLAYBACK),
    now_playing: z.string().max(NOW_PLAYING_LONGEST).nullable(),
    screen_time_today: z.int().min(0).max(MINUTES_PER_DAY),
    screen_on: z.boolean(),
    phone_context: PHONE_CONTEXT_STATE,
    context_confidence: PERCENT,
    place: PHONE_PLACE_NAME.nullable(),
  })
  .partial();

export type PhoneValues = z.infer<typeof PHONE_VALUES>;

const MOMENT = z.iso.datetime({ offset: true });

export const PHONE_EVENT = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('phone_context_changed'),
    at: MOMENT,
    details: z.strictObject({
      from: PHONE_CONTEXT_STATE,
      to: PHONE_CONTEXT_STATE,
      confidence: PERCENT,
      place: PHONE_PLACE_NAME.nullable(),
    }),
  }),
  z.strictObject({
    kind: z.enum(['place_arrived', 'place_left']),
    at: MOMENT,
    details: z.strictObject({ place: PHONE_PLACE_NAME }),
  }),
  z.strictObject({
    kind: z.literal('parked'),
    at: MOMENT,
    details: z.strictObject({ place: PHONE_PLACE_NAME.nullable() }),
  }),
  z.strictObject({
    kind: z.literal('phone_unlocked'),
    at: MOMENT,
    details: z.strictObject({}),
  }),
]);

export type PhoneEvent = z.infer<typeof PHONE_EVENT>;

const PHONE_EVENTS_MOST = 50;

export const PHONE_REPORT = NODE_REPORT.omit({ metrics: true }).extend({
  values: PHONE_VALUES,
  events: z.array(PHONE_EVENT).max(PHONE_EVENTS_MOST),
});

export type PhoneReport = z.infer<typeof PHONE_REPORT>;

export const PHONE_ACTION = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ring'), on: z.boolean() }),
  z.strictObject({
    type: z.literal('set_volume'),
    stream: z.enum(PHONE_VOLUME_STREAMS),
    percent: PERCENT,
  }),
  z.strictObject({ type: z.literal('set_ringer'), mode: z.enum(PHONE_RINGER_MODES) }),
  z.strictObject({ type: z.literal('set_dnd'), on: z.boolean() }),
  z.strictObject({ type: z.literal('flashlight'), mode: z.enum(PHONE_FLASHLIGHT_MODES) }),
  z.strictObject({ type: z.literal('media'), key: z.enum(PHONE_MEDIA_KEYS) }),
  z.strictObject({
    type: z.literal('open_url'),
    url: z.url({ protocol: /^(https?|geo|tel|mailto)$/ }),
    label: z.string().trim().min(1).max(80),
  }),
  z.strictObject({ type: z.literal('refresh') }),
]);

export type PhoneAction = z.infer<typeof PHONE_ACTION>;

export const PHONE_ACTION_RESULT = WATCH_ACTION_RESULT;

export type PhoneActionResult = z.infer<typeof PHONE_ACTION_RESULT>;

export const PHONE_ACTION_ANSWER = PHONE_ACTION_RESULT.extend({ requestId: z.uuid() });

export const PHONE_ACTION_PUSH = z.strictObject({
  requestId: z.uuid(),
  action: PHONE_ACTION,
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});

export type PhoneActionPush = z.infer<typeof PHONE_ACTION_PUSH>;

export const PHONE_CONTEXT = z.strictObject({
  profileId: z.uuid(),
  deviceId: z.uuid().nullable(),
  state: PHONE_CONTEXT_STATE,
  since: MOMENT.nullable(),
  confidence: PERCENT.nullable(),
  place: PHONE_PLACE_NAME.nullable(),
  placeShared: z.boolean(),
  phoneInUse: z.boolean().nullable(),
  reportedAt: MOMENT.nullable(),
});

export type PhoneContext = z.infer<typeof PHONE_CONTEXT>;
