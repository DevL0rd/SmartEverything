import { z } from 'zod';
import { BRUSH_PROFILE_SHARED } from './toothbrush-base';
import { GATT_UUID, HEX } from './treadmill';

export const ORALB_DRIVER = 'oralb_io';

export const ORALB_COMPANY_ID = 220;

export const ORALB_MODEL_PREFIX = 'oralb.toothbrush.io';

export const ORALB_DEFAULT_NAME = 'Oral-B iO';

export const ORALB_PROTOCOLS = [6, 7, 8, 9] as const;

export const ORALB_CHARACTERISTICS = [
  'FF05',
  'FF0A',
  'FF0B',
  'FF2B',
  'FF2D',
  'FF25',
  'FF26',
  'FF29',
] as const;

export type OralbCharacteristic = (typeof ORALB_CHARACTERISTICS)[number];

export const ORALB_IDENTITY = z.strictObject({
  address: z.string().min(1),
  advertAddress: z.string().min(1),
  protocol: z.number().int().min(0).max(255),
  modelId: z.number().int().min(0).max(255),
  firmware: z.number().int().min(0).max(255),
  gapName: z.string().nullable(),
  services: z.array(GATT_UUID),
  present: z.array(z.enum(ORALB_CHARACTERISTICS)),
  ff05Length: z.number().int().nonnegative().nullable(),
  ff05Runtime: z.number().int().nonnegative().nullable(),
  ff0bLength: z.number().int().nonnegative().nullable(),
  ff2bLength: z.number().int().nonnegative().nullable(),
  ff2dLength: z.number().int().nonnegative().nullable(),
  advertHex: HEX,
  clock: z.number().int().nonnegative().nullable(),
});

export type OralbIdentity = z.infer<typeof ORALB_IDENTITY>;

export const ORALB_BATTERY_KINDS = ['percent', 'runtime', 'extended'] as const;

export const ORALB_FACE_KINDS = ['display', 'advert'] as const;

export const ORALB_MAX_SECTORS = 8;

export const ORALB_PROFILE = z.strictObject({
  ...BRUSH_PROFILE_SHARED,
  brand: z.literal('oralb'),
  zoneSource: z.literal('pacer'),
  writes: z.literal(false),
  motion: z.literal(false),
  protocol: z.union([z.literal(6), z.literal(7), z.literal(8), z.literal(9)]).nullable(),
  modelId: z.number().int().min(0).max(255),
  battery: z.enum(ORALB_BATTERY_KINDS),
  face: z.enum(ORALB_FACE_KINDS),
  ring: z.boolean(),
  sectors: z.number().int().min(0).max(ORALB_MAX_SECTORS),
});

export type OralbProfile = z.infer<typeof ORALB_PROFILE>;

function protocolOf(value: number): OralbProfile['protocol'] {
  switch (value) {
    case 6:
    case 7:
    case 8:
    case 9:
      return value;
    default:
      return null;
  }
}

function batteryKindOf(identity: OralbIdentity): OralbProfile['battery'] {
  if (identity.ff05Length === 8) {
    return 'extended';
  }
  const runtime = identity.ff05Runtime;
  return identity.ff05Length === 3 && runtime !== null && runtime !== 0 ? 'runtime' : 'percent';
}

export const ORALB_EMPTY_SECTOR = 0xff;

export function oralbSectorsOf(schedule: readonly number[]): number[] {
  return schedule.filter((seconds) => seconds > 0 && seconds !== ORALB_EMPTY_SECTOR);
}

export function oralbProfileOf(
  identity: OralbIdentity,
  schedule: readonly number[] | null,
): OralbProfile {
  const protocol = protocolOf(identity.protocol);
  const sectors = Math.min(ORALB_MAX_SECTORS, oralbSectorsOf(schedule ?? []).length);
  const has = (suffix: OralbCharacteristic): boolean => identity.present.includes(suffix);
  return {
    brand: 'oralb',
    protocol,
    modelId: identity.modelId,
    pressure: identity.ff0bLength === 10 ? 'force' : 'state',
    battery: batteryKindOf(identity),
    history: protocol !== null && protocol >= 7 ? 'retained' : 'observed_only',
    face: has('FF0A') ? 'display' : 'advert',
    ring: has('FF2B') && identity.ff2bLength === 4,
    head: has('FF2D') && identity.ff2dLength === 5 ? 'countdown' : 'none',
    sectors,
    zones: sectors === 4 ? 4 : 0,
    zoneSource: 'pacer',
    writes: false,
    motion: false,
  };
}

export const ORALB_MODES = [
  'daily_clean',
  'sensitive',
  'gum_care',
  'whiten',
  'intense',
  'super_sensitive',
  'tongue_clean',
  'smart_adapt',
  'gentle_white',
] as const;

export type OralbMode = (typeof ORALB_MODES)[number];

export const ORALB_MODE_LABELS: Readonly<Record<OralbMode, string>> = {
  daily_clean: 'Daily Clean',
  sensitive: 'Sensitive',
  gum_care: 'Gum Care',
  whiten: 'Whiten',
  intense: 'Intense',
  super_sensitive: 'Super Sensitive',
  tongue_clean: 'Tongue Clean',
  smart_adapt: 'Smart Adapt',
  gentle_white: 'Gentle White',
};

export const ORALB_MODE_IDS: Readonly<Record<OralbMode, number>> = {
  daily_clean: 0,
  sensitive: 1,
  gum_care: 2,
  whiten: 3,
  intense: 4,
  super_sensitive: 5,
  tongue_clean: 6,
  smart_adapt: 11,
  gentle_white: 12,
};

export const ORALB_MODE_ANGLES: Readonly<Partial<Record<OralbMode, number>>> = {
  daily_clean: 28,
  sensitive: 20,
  intense: 33,
};

export function oralbModeOf(id: number): OralbMode | null {
  return ORALB_MODES.find((mode) => ORALB_MODE_IDS[mode] === id) ?? null;
}

export const ORALB_RING_COLOURS = {
  white: [0x44, 0xcf, 0x63],
  yellow: [0x80, 0xff, 0x00],
  orange: [0xfc, 0x70, 0x00],
  blue: [0x0f, 0x5b, 0xcc],
  turquoise: [0x00, 0xff, 0x3d],
  pink: [0xb2, 0x09, 0x1a],
} as const;

export type OralbRingName = keyof typeof ORALB_RING_COLOURS;

export const ORALB_RING_NAMES = [
  'white',
  'yellow',
  'orange',
  'blue',
  'turquoise',
  'pink',
] as const satisfies readonly OralbRingName[];

export const ORALB_RING_VALUES = [...ORALB_RING_NAMES, 'custom'] as const;

export type OralbRingValue = (typeof ORALB_RING_VALUES)[number];

export function oralbRingOf(levels: readonly number[]): OralbRingValue {
  const found = ORALB_RING_NAMES.find((name) =>
    ORALB_RING_COLOURS[name].every((level, index) => levels[index] === level),
  );
  return found ?? 'custom';
}

export function oralbRingDisplayOf(levels: readonly number[]): readonly [number, number, number] {
  const white = ORALB_RING_COLOURS.white;
  const channel = (index: 0 | 1 | 2): number =>
    Math.min(255, Math.round(((levels[index] ?? 0) * 255) / white[index]));
  return [channel(0), channel(1), channel(2)];
}

export const ORALB_HANDLE_COLOURS = ['black', 'white', 'rose', 'aqua', 'lavender'] as const;

export const ORALB_PROBES = [
  'advert_log',
  'connect_dump',
  'history_select',
  'metadata_select',
  'pacer_write',
  'mode_order_write',
  'ring_write',
  'head_reset_write',
  'clock_write',
] as const;

export type OralbProbe = (typeof ORALB_PROBES)[number];

export const ORALB_PREFIX_RULES = ['prefixed', 'plain'] as const;

export type OralbPrefixRuleName = (typeof ORALB_PREFIX_RULES)[number];

export const ORALB_PROBE_RESULT = z.union([
  z.strictObject({
    passedAt: z.iso.datetime({ offset: true }),
    firmware: z.number().int(),
    rule: z.enum(ORALB_PREFIX_RULES).optional(),
  }),
  z.strictObject({
    failedAt: z.iso.datetime({ offset: true }),
    firmware: z.number().int(),
    reason: z.string(),
  }),
]);

export const ORALB_FORCE_BANDS = z.strictObject({
  lightBelow: z.number(),
  highAbove: z.number(),
  samples: z.number().int().nonnegative(),
});

export const ORALB_HEAD_BASELINE = z.strictObject({
  days: z.number().int().nonnegative(),
  seconds: z.number().int().nonnegative(),
  at: z.iso.datetime({ offset: true }),
});

export const ORALB_HEAD_LAST = z.strictObject({
  days: z.number().int().nonnegative(),
  seconds: z.number().int().nonnegative(),
});

export type OralbHeadBaseline = z.infer<typeof ORALB_HEAD_BASELINE>;

export const ORALB_MISSED_LIMIT = 30;

export const ORALB_MISSED = z.strictObject({
  handleSessionId: z.number().int().nonnegative(),
  startedAt: z.iso.datetime({ offset: true }),
});

export const ORALB_LIVE_MODES = ['broadcast', 'connected'] as const;

export const ORALB_DEFAULT_MODEL = 'iO9';

export const ORALB_SETTINGS = z.strictObject({
  live: z.enum(ORALB_LIVE_MODES).default('broadcast'),
  headWarnDays: z.number().int().nonnegative().default(14),
  headDueDays: z.number().int().nonnegative().default(0),
  handleColour: z.enum(ORALB_HANDLE_COLOURS).default('black'),
  model: z.string().min(1).default(ORALB_DEFAULT_MODEL),
  probes: z.partialRecord(z.enum(ORALB_PROBES), ORALB_PROBE_RESULT).default({}),
  forceBands: ORALB_FORCE_BANDS.nullable().default(null),
  headBaseline: ORALB_HEAD_BASELINE.nullable().default(null),
  headLast: ORALB_HEAD_LAST.nullable().default(null),
  missed: z.array(ORALB_MISSED).max(ORALB_MISSED_LIMIT).default([]),
});

export type OralbSettings = z.infer<typeof ORALB_SETTINGS>;

export const ORALB_SETTINGS_CHANGE = z.strictObject({
  live: ORALB_SETTINGS.shape.live.unwrap().optional(),
  headWarnDays: ORALB_SETTINGS.shape.headWarnDays.unwrap().optional(),
  headDueDays: ORALB_SETTINGS.shape.headDueDays.unwrap().optional(),
  handleColour: ORALB_SETTINGS.shape.handleColour.unwrap().optional(),
  model: ORALB_SETTINGS.shape.model.unwrap().optional(),
});

export type OralbSettingsChange = z.infer<typeof ORALB_SETTINGS_CHANGE>;

export function oralbModelKey(identity: Pick<OralbIdentity, 'modelId'>): string {
  return `${ORALB_MODEL_PREFIX}${identity.modelId.toString(16).padStart(2, '0')}`;
}

export function oralbExternalId(identity: Pick<OralbIdentity, 'address'>): string {
  return `${ORALB_DRIVER}:${identity.address}`;
}

export function oralbDefaultModelOf(modelId: number): string {
  return [0x31, 0x32, 0x36].includes(modelId) ? ORALB_DEFAULT_MODEL : 'iO';
}

export function oralbRoutineOf(schedule: readonly number[]): number | null {
  const total = oralbSectorsOf(schedule).reduce((sum, seconds) => sum + seconds, 0);
  return total > 0 ? total : null;
}

export function oralbHeadWear(
  daysLeft: number,
  secondsLeft: number,
  baseline: Pick<OralbHeadBaseline, 'days' | 'seconds'> | null,
): number | null {
  if (baseline === null) {
    return null;
  }
  const [left, start] =
    baseline.days > 0 ? [daysLeft, baseline.days] : [secondsLeft, baseline.seconds];
  if (start <= 0) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round((1 - left / start) * 100)));
}

export function oralbActivityOf(
  state: number,
  timerAdvancing: boolean,
): 'asleep' | 'off' | 'standby' | 'brushing' | 'charging' {
  switch (state) {
    case 115:
      return 'asleep';
    case 116:
      return 'off';
    case 3:
      return 'brushing';
    case 4:
      return 'charging';
    case 8:
      return timerAdvancing ? 'brushing' : 'standby';
    default:
      return 'standby';
  }
}
