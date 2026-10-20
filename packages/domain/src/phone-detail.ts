import { z } from 'zod';
import { MACHINE_PERMISSION_ID } from './machine-actions';
import {
  PERCENT,
  PHONE_AUDIO_OUTPUTS,
  PHONE_CHARGERS,
  PHONE_NETWORKS,
  PHONE_PLAYBACK,
  PHONE_SIGNAL_BARS_MOST,
} from './phone-enums';

const MOMENT = z.iso.datetime({ offset: true });

const BYTES = z.int().min(0);

const COUNT = z.int().min(0);

const MINUTES_PER_DAY = 1440;

const DAYS_IN_WEEK = 7;

const BARS = z.int().min(0).max(PHONE_SIGNAL_BARS_MOST);

const SUPPORT_REASON = z.string().trim().min(1).max(200);

export const PHONE_FEATURES = [
  'usage',
  'notifications',
  'dnd',
  'write_settings',
  'overlay',
  'bluetooth',
  'location',
  'activity',
  'telephony',
  'torch',
  'torch_strength',
  'fold',
] as const;

export type PhoneFeature = (typeof PHONE_FEATURES)[number];

export const PHONE_FEATURE = z.enum(PHONE_FEATURES);

export const PHONE_FEATURE_SUPPORT = z.discriminatedUnion('state', [
  z.strictObject({ feature: PHONE_FEATURE, state: z.literal('ready') }),
  z.strictObject({
    feature: PHONE_FEATURE,
    state: z.literal('needs_permission'),
    permission: MACHINE_PERMISSION_ID,
    reason: SUPPORT_REASON,
  }),
  z.strictObject({
    feature: PHONE_FEATURE,
    state: z.literal('unsupported'),
    reason: SUPPORT_REASON,
  }),
]);

export type PhoneFeatureSupport = z.infer<typeof PHONE_FEATURE_SUPPORT>;

export const PHONE_FEATURE_SUPPORTS = z
  .array(PHONE_FEATURE_SUPPORT)
  .refine((list) => new Set(list.map((support) => support.feature)).size === list.length, {
    message: 'each feature is reported once',
  });

export const PHONE_BATTERY_HEALTHS = [
  'good',
  'overheat',
  'dead',
  'over_voltage',
  'failure',
  'cold',
  'unknown',
] as const;

export const PHONE_CELLULAR_GENERATIONS = ['2g', '3g', '4g', '5g'] as const;

export const PHONE_BLUETOOTH_KINDS = [
  'watch',
  'headset',
  'speaker',
  'car',
  'computer',
  'other',
] as const;

export const PHONE_STORAGE_PARTS = ['apps', 'images', 'video', 'audio', 'system', 'other'] as const;

export const PHONE_FOLD_STATES = ['open', 'folded'] as const;

const POWER_SECTION = z.object({
  level: PERCENT,
  voltageMv: COUNT,
  currentMa: z.int().nullable(),
  temperatureC: z.number(),
  health: z.enum(PHONE_BATTERY_HEALTHS),
  cycles: COUNT.nullable(),
  charger: z.enum(PHONE_CHARGERS),
  fullAt: MOMENT.nullable(),
  memory: z.object({ totalBytes: BYTES, availableBytes: BYTES }),
});

const SOUND_SECTION = z.object({
  streams: z.object({
    media: PERCENT,
    ring: PERCENT,
    alarm: PERCENT,
    notification: PERCENT,
    call: PERCENT,
  }),
  hapticFeedback: z.boolean(),
  touchSounds: z.boolean(),
  output: z.object({ kind: z.enum(PHONE_AUDIO_OUTPUTS), name: z.string().nullable() }),
  media: z
    .object({
      title: z.string().nullable(),
      artist: z.string().nullable(),
      app: z.string().nullable(),
      appLabel: z.string().nullable(),
      state: z.enum(PHONE_PLAYBACK),
      positionMs: COUNT.nullable(),
      durationMs: COUNT.nullable(),
    })
    .nullable(),
});

const SCREEN_SECTION = z.object({
  brightness: PERCENT,
  auto: z.boolean(),
  autoRotate: z.boolean(),
  timeoutSeconds: z.int().min(1),
  fold: z.enum(PHONE_FOLD_STATES).nullable(),
  writable: z.boolean(),
  usage: z
    .object({
      unlocksToday: COUNT,
      screenMinutesByDay: z
        .array(z.object({ day: z.iso.date(), minutes: z.int().min(0).max(MINUTES_PER_DAY) }))
        .length(DAYS_IN_WEEK),
    })
    .nullable(),
});

const DATA_USE = z.object({ wifiBytes: BYTES, mobileBytes: BYTES });

const NETWORK_SECTION = z.object({
  kind: z.enum(PHONE_NETWORKS),
  wifi: z
    .object({
      ssid: z.string().nullable(),
      rssiDbm: z.int(),
      bars: BARS,
      linkMbps: COUNT,
      bandGhz: z.number().min(0),
    })
    .nullable(),
  cellular: z
    .object({
      bars: BARS,
      generation: z.enum(PHONE_CELLULAR_GENERATIONS),
      operator: z.string().nullable(),
    })
    .nullable(),
  vpn: z.boolean(),
  metered: z.boolean(),
  airplane: z.boolean(),
  wifiOn: z.boolean(),
  locationOn: z.boolean(),
  data: z.object({ today: DATA_USE, month: DATA_USE }).nullable(),
});

const CONNECTIONS_SECTION = z.object({
  bluetoothOn: z.boolean(),
  bluetooth: z.array(
    z.object({
      name: z.string().nullable(),
      kind: z.enum(PHONE_BLUETOOTH_KINDS),
      batteryPercent: PERCENT.nullable(),
    }),
  ),
});

const STORAGE_SECTION = z.object({
  totalBytes: BYTES,
  freeBytes: BYTES,
  parts: z.array(z.object({ kind: z.enum(PHONE_STORAGE_PARTS), bytes: BYTES })),
  apps: z.array(z.object({ package: z.string().min(1), label: z.string(), bytes: BYTES })),
});

const APPS_SECTION = z.object({
  installedCount: COUNT,
  installed: z.array(
    z.object({ package: z.string().min(1), label: z.string(), iconHash: z.string().nullable() }),
  ),
  usage: z.array(
    z.object({
      package: z.string().min(1),
      minutesToday: z.int().min(0).max(MINUTES_PER_DAY),
      minutesByDay: z.array(z.int().min(0).max(MINUTES_PER_DAY)).length(DAYS_IN_WEEK),
      lastUsedAt: MOMENT.nullable(),
    }),
  ),
  front: z.string().nullable(),
});

const NOTIFICATIONS_SECTION = z.object({
  count: COUNT,
  apps: z.array(z.object({ package: z.string().min(1), label: z.string(), count: COUNT })),
  items: z
    .array(
      z.object({
        key: z.string().min(1),
        package: z.string().min(1),
        title: z.string().nullable(),
        at: MOMENT,
      }),
    )
    .nullable(),
});

const ALARM_SECTION = z.object({ nextAt: MOMENT.nullable(), appLabel: z.string().nullable() });

const PHONE_DETAIL_SECTIONS = {
  power: POWER_SECTION,
  sound: SOUND_SECTION,
  screen: SCREEN_SECTION,
  network: NETWORK_SECTION,
  connections: CONNECTIONS_SECTION,
  storage: STORAGE_SECTION,
  apps: APPS_SECTION,
  notifications: NOTIFICATIONS_SECTION,
  alarm: ALARM_SECTION,
} as const;

export const PHONE_DETAIL_SECTION_NAMES = [
  'power',
  'sound',
  'screen',
  'network',
  'connections',
  'storage',
  'apps',
  'notifications',
  'alarm',
] as const satisfies readonly (keyof typeof PHONE_DETAIL_SECTIONS)[];

export type PhoneDetailSectionName = (typeof PHONE_DETAIL_SECTION_NAMES)[number];

export const PHONE_DETAIL_UPDATE = z
  .object({
    power: POWER_SECTION.optional(),
    sound: SOUND_SECTION.optional(),
    screen: SCREEN_SECTION.optional(),
    network: NETWORK_SECTION.optional(),
    connections: CONNECTIONS_SECTION.optional(),
    storage: STORAGE_SECTION.optional(),
    apps: APPS_SECTION.optional(),
    notifications: NOTIFICATIONS_SECTION.optional(),
    alarm: ALARM_SECTION.optional(),
  })
  .refine((update) => Object.values(update).some((section) => section !== undefined), {
    message: 'a detail update carries at least one section',
  });

export type PhoneDetailUpdate = z.infer<typeof PHONE_DETAIL_UPDATE>;

export const PHONE_DETAIL = z.object({
  power: POWER_SECTION.extend({ at: MOMENT }).optional(),
  sound: SOUND_SECTION.extend({ at: MOMENT }).optional(),
  screen: SCREEN_SECTION.extend({ at: MOMENT }).optional(),
  network: NETWORK_SECTION.extend({ at: MOMENT }).optional(),
  connections: CONNECTIONS_SECTION.extend({ at: MOMENT }).optional(),
  storage: STORAGE_SECTION.extend({ at: MOMENT }).optional(),
  apps: APPS_SECTION.extend({ at: MOMENT }).optional(),
  notifications: NOTIFICATIONS_SECTION.extend({ at: MOMENT }).optional(),
  alarm: ALARM_SECTION.extend({ at: MOMENT }).optional(),
});

export type PhoneDetail = z.infer<typeof PHONE_DETAIL>;

export const PHONE_DETAIL_PARTS = PHONE_DETAIL.refine(
  (parts) => Object.values(parts).some((section) => section !== undefined),
  { message: 'a detail notice carries at least one section' },
);

export const PHONE_DETAIL_NOTICE = z.strictObject({
  type: z.literal('phone_detail'),
  deviceId: z.uuid(),
  parts: PHONE_DETAIL_PARTS,
});

export type PhoneDetailNotice = z.infer<typeof PHONE_DETAIL_NOTICE>;

export const PHONE_ICON_HASH = z.string().regex(/^[0-9a-f]{64}$/);

export const PHONE_ICON_UPLOAD = z.strictObject({
  hash: PHONE_ICON_HASH,
  webpBase64: z.base64(),
});

export type PhoneIconUpload = z.infer<typeof PHONE_ICON_UPLOAD>;

export interface PhoneDetailIssue {
  readonly section: PhoneDetailSectionName;
  readonly issue: string;
}

export interface PhoneDetailSplit {
  readonly update: PhoneDetailUpdate | undefined;
  readonly invalid: readonly PhoneDetailIssue[];
}

export function splitPhoneDetail(raw: Readonly<Record<string, unknown>>): PhoneDetailSplit {
  const whole = PHONE_DETAIL_UPDATE.safeParse(raw);
  if (whole.success) return { update: whole.data, invalid: [] };
  const invalid: PhoneDetailIssue[] = [];
  const kept: Record<string, unknown> = {};
  for (const name of PHONE_DETAIL_SECTION_NAMES) {
    if (raw[name] === undefined) continue;
    const section = PHONE_DETAIL_SECTIONS[name].safeParse(raw[name]);
    if (section.success) kept[name] = section.data;
    else {
      const issue = section.error.issues
        .map((found) => `${found.path.join('.')} ${found.message}`)
        .join('; ');
      invalid.push({ section: name, issue });
    }
  }
  const rest = PHONE_DETAIL_UPDATE.safeParse(kept);
  return { update: rest.success ? rest.data : undefined, invalid };
}

export function stampPhoneDetail(update: PhoneDetailUpdate, at: string): PhoneDetail {
  return PHONE_DETAIL.parse(
    Object.fromEntries(
      PHONE_DETAIL_SECTION_NAMES.flatMap((name) => {
        const section = update[name];
        return section === undefined ? [] : [[name, { ...section, at }]];
      }),
    ),
  );
}

export function mergePhoneDetail(stored: PhoneDetail, parts: PhoneDetail): PhoneDetail {
  return { ...stored, ...parts };
}
