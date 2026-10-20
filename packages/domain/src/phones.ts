import { z } from 'zod';
import {
  MACHINE_ACTION_SUPPORTS,
  MACHINE_PERMISSION_STATES,
  MACHINE_ACTION,
  type MachineAction,
} from './machine-actions';
import { COMMAND_SOURCE } from './api/rows-home';
import { NODE_REPORT } from './node/report';
import {
  PERCENT,
  PHONE_AUDIO_OUTPUTS,
  PHONE_CHARGERS,
  PHONE_NETWORKS,
  PHONE_PLAYBACK,
  PHONE_SIGNAL_BARS_MOST,
  PHONE_THERMAL_STATES,
  PHONE_TORCH_STATES,
} from './phone-enums';
import { PHONE_FEATURE_SUPPORTS } from './phone-detail';
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

export const PHONE_VOLUME_STREAMS = ['media', 'ring', 'alarm', 'notification'] as const;

export const PHONE_FLASHLIGHT_MODES = ['on', 'off', 'toggle'] as const;

export const PHONE_MEDIA_KEYS = ['play', 'pause', 'next', 'previous'] as const;

export const PHONE_SYSTEM_TOGGLES = ['auto_rotate', 'haptic_feedback', 'touch_sounds'] as const;

export type PhoneSystemToggle = (typeof PHONE_SYSTEM_TOGGLES)[number];

export const PHONE_SETTINGS_PAGES = [
  'wifi',
  'bluetooth',
  'internet',
  'location',
  'airplane',
  'nfc',
  'battery_saver',
  'display',
  'sound',
  'dnd_access',
  'write_settings',
  'app_details',
] as const;

export type PhoneSettingsPage = (typeof PHONE_SETTINGS_PAGES)[number];

export const PHONE_SCREEN_TIMEOUTS = [15, 30, 60, 120, 300, 600, 1800] as const;

export const PHONE_SCREEN_TIMEOUT_OPTIONS: readonly string[] = PHONE_SCREEN_TIMEOUTS.map(String);

export const PHONE_CONTEXT_STATE = z.enum(PHONE_CONTEXT_STATES);

export const PHONE_PLACE_NAME = z.string().trim().min(1).max(120);

const MINUTES_PER_DAY = 1440;

const MOMENT = z.iso.datetime({ offset: true });

export const PHONE_VALUES = z
  .object({
    battery: PERCENT,
    charging: z.boolean(),
    network: z.enum(PHONE_NETWORKS),
    ringer_mode: z.enum(PHONE_RINGER_MODES),
    dnd: z.boolean(),
    volume: PERCENT,
    playback: z.enum(PHONE_PLAYBACK),
    now_playing: z.string().nullable(),
    screen_time_today: z.int().min(0).max(MINUTES_PER_DAY),
    screen_on: z.boolean(),
    phone_context: PHONE_CONTEXT_STATE,
    context_confidence: PERCENT,
    place: PHONE_PLACE_NAME.nullable(),
    charger: z.enum(PHONE_CHARGERS),
    charge_full_at: MOMENT.nullable(),
    battery_temperature: z.number(),
    power_save: z.boolean(),
    thermal_state: z.enum(PHONE_THERMAL_STATES),
    ring_volume: PERCENT,
    alarm_volume: PERCENT,
    notification_volume: PERCENT,
    audio_output: z.enum(PHONE_AUDIO_OUTPUTS),
    in_call: z.boolean(),
    brightness: PERCENT,
    auto_brightness: z.boolean(),
    flashlight: z.enum(PHONE_TORCH_STATES),
    ringing: z.boolean(),
    storage_free: z.int().min(0),
    notification_count: z.int().min(0),
    next_alarm: MOMENT.nullable(),
    signal_strength: z.int().min(0).max(PHONE_SIGNAL_BARS_MOST),
    screen_timeout: z.string().refine((seconds) => PHONE_SCREEN_TIMEOUT_OPTIONS.includes(seconds), {
      message: 'not one of the screen timeouts a phone can be set to',
    }),
    auto_rotate: z.boolean(),
    haptic_feedback: z.boolean(),
    touch_sounds: z.boolean(),
    wifi_on: z.boolean(),
    bluetooth_on: z.boolean(),
    location_on: z.boolean(),
    airplane_mode: z.boolean(),
  })
  .partial();

export type PhoneValues = z.infer<typeof PHONE_VALUES>;

export const PHONE_EVENT = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('phone_context_changed'),
    at: MOMENT,
    details: z.object({
      from: PHONE_CONTEXT_STATE,
      to: PHONE_CONTEXT_STATE,
      confidence: PERCENT,
      place: PHONE_PLACE_NAME.nullable(),
    }),
  }),
  z.object({
    kind: z.enum(['place_arrived', 'place_left']),
    at: MOMENT,
    details: z.object({ place: PHONE_PLACE_NAME }),
  }),
  z.object({
    kind: z.literal('parked'),
    at: MOMENT,
    details: z.object({ place: PHONE_PLACE_NAME.nullable() }),
  }),
  z.object({
    kind: z.literal('phone_unlocked'),
    at: MOMENT,
    details: z.object({}),
  }),
]);

export type PhoneEvent = z.infer<typeof PHONE_EVENT>;

export const PHONE_REPORT = NODE_REPORT.omit({ metrics: true }).extend({
  values: PHONE_VALUES,
  events: z.array(PHONE_EVENT),
  actions: MACHINE_ACTION_SUPPORTS.optional(),
  permissions: MACHINE_PERMISSION_STATES.optional(),
  features: PHONE_FEATURE_SUPPORTS.optional(),
  detail: z.record(z.string(), z.unknown()).optional(),
});

export type PhoneReport = z.infer<typeof PHONE_REPORT>;

export const PHONE_DISMISS_TARGET = z.discriminatedUnion('by', [
  z.strictObject({ by: z.literal('key'), key: z.string().trim().min(1) }),
  z.strictObject({ by: z.literal('app'), app: z.string().trim().min(1).max(200) }),
]);

export type PhoneDismissTarget = z.infer<typeof PHONE_DISMISS_TARGET>;

const PHONE_ASKED_ACTIONS = [
  z.strictObject({ type: z.literal('ring'), on: z.boolean() }),
  z.strictObject({
    type: z.literal('set_volume'),
    stream: z.enum(PHONE_VOLUME_STREAMS),
    percent: PERCENT,
  }),
  z.strictObject({ type: z.literal('set_ringer'), mode: z.enum(PHONE_RINGER_MODES) }),
  z.strictObject({ type: z.literal('set_dnd'), on: z.boolean() }),
  z.strictObject({ type: z.literal('flashlight'), mode: z.enum(PHONE_FLASHLIGHT_MODES) }),
  z.strictObject({ type: z.literal('set_flashlight_level'), percent: z.int().min(1).max(100) }),
  z.strictObject({ type: z.literal('media'), key: z.enum(PHONE_MEDIA_KEYS) }),
  z.strictObject({ type: z.literal('seek'), positionMs: z.int().min(0) }),
  z.strictObject({
    type: z.literal('open_url'),
    url: z.url({ protocol: /^(https?|geo|tel|mailto)$/ }),
    label: z.string().trim().min(1).max(80),
  }),
  z.strictObject({ type: z.literal('refresh') }),
  z.strictObject({ type: z.literal('launch_app'), app: z.string().trim().min(1).max(200) }),
  z.strictObject({ type: z.literal('set_brightness'), percent: PERCENT }),
  z.strictObject({ type: z.literal('set_auto_brightness'), on: z.boolean() }),
  z.strictObject({
    type: z.literal('set_timeout'),
    seconds: z.union(PHONE_SCREEN_TIMEOUTS.map((seconds) => z.literal(seconds))),
  }),
  z.strictObject({
    type: z.literal('set_system_toggle'),
    setting: z.enum(PHONE_SYSTEM_TOGGLES),
    on: z.boolean(),
  }),
  z.strictObject({ type: z.literal('open_settings'), page: z.enum(PHONE_SETTINGS_PAGES) }),
  z.strictObject({ type: z.literal('dismiss_notification'), target: PHONE_DISMISS_TARGET }),
  z.strictObject({ type: z.literal('lock') }),
  z.strictObject({ type: z.literal('show_unlock') }),
  z.strictObject({ type: z.literal('screenshot') }),
] as const;

const PHONE_RECEIVE_FILE = z.strictObject({ type: z.literal('receive_file'), fileId: z.uuid() });

export const PHONE_FILE_PUSH = z.strictObject({
  type: z.literal('receive_file'),
  fileId: z.uuid(),
  name: z.string().min(1).max(200),
  mime: z.string().min(1).max(200),
  url: z.string().startsWith('/media/'),
});

export type PhoneFilePush = z.infer<typeof PHONE_FILE_PUSH>;

const PHONE_LIVE_ACTION = z.strictObject({ type: z.literal('live'), on: z.boolean() });

export const PHONE_DIRECT_ACTION = z.discriminatedUnion('type', PHONE_ASKED_ACTIONS);

export type PhoneDirectAction = z.infer<typeof PHONE_DIRECT_ACTION>;

export const PHONE_ACTION = z.discriminatedUnion('type', [
  ...PHONE_ASKED_ACTIONS,
  PHONE_RECEIVE_FILE,
]);

export const PHONE_PUSHED_ACTION = z.discriminatedUnion('type', [
  ...PHONE_ASKED_ACTIONS,
  PHONE_FILE_PUSH,
  PHONE_LIVE_ACTION,
]);

export type PhonePushedAction = z.infer<typeof PHONE_PUSHED_ACTION>;

export type PhoneAction = z.infer<typeof PHONE_ACTION>;

export type PhoneRunAction =
  Exclude<PhoneAction, { readonly type: 'receive_file' }> | PhoneFilePush;

const PHONE_MACHINE_ACTIONS: Readonly<Partial<Record<PhoneAction['type'], MachineAction>>> = {
  flashlight: 'flashlight',
  launch_app: 'launch_app',
  open_url: 'open',
  screenshot: 'screenshot',
  lock: 'lock',
  show_unlock: 'show_unlock',
  receive_file: 'receive_file',
};

export function machineActionOfPhoneAction(action: PhoneAction): MachineAction | null {
  if (action.type === 'ring') {
    return action.on ? 'ring' : 'stop_ring';
  }
  return PHONE_MACHINE_ACTIONS[action.type] ?? null;
}

export const PHONE_ACTION_RESULT = WATCH_ACTION_RESULT.extend({ image: z.base64().optional() });

export type PhoneActionResult = z.infer<typeof PHONE_ACTION_RESULT>;

export const PHONE_ACTION_ANSWER = PHONE_ACTION_RESULT.extend({ requestId: z.uuid() });

export const PHONE_APPROVAL = z.strictObject({
  action: MACHINE_ACTION,
  machine: z.string().min(1).max(120),
  source: COMMAND_SOURCE.exclude(['app']),
});

export type PhoneApproval = z.infer<typeof PHONE_APPROVAL>;

export const PHONE_APPROVAL_PUSH = z.object({
  requestId: z.uuid(),
  approval: PHONE_APPROVAL,
  expiresAt: z.iso.datetime({ offset: true }),
});

export type PhoneApprovalPush = z.infer<typeof PHONE_APPROVAL_PUSH>;

export const PHONE_APPROVAL_CANCEL_PUSH = z.object({ requestId: z.uuid() });

export const PHONE_ACTION_ORIGIN = z.strictObject({
  source: COMMAND_SOURCE,
  client: z.string().min(1).max(120).nullable(),
});

export type PhoneActionOrigin = z.infer<typeof PHONE_ACTION_ORIGIN>;

export const PHONE_ACTION_PUSH = z.object({
  requestId: z.uuid(),
  action: PHONE_PUSHED_ACTION,
  origin: PHONE_ACTION_ORIGIN,
  expiresAt: z.iso.datetime({ offset: true }).optional(),
});

export type PhoneActionPush = z.infer<typeof PHONE_ACTION_PUSH>;

export const PHONE_CONTEXT = z.object({
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
