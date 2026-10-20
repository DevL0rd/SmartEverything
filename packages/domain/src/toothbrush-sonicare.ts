import { z } from 'zod';
import { BRUSH_PROFILE_SHARED } from './toothbrush-base';
import { GATT_UUID, HEX } from './treadmill';

export const SONICARE_DRIVER = 'philips_sonicare';

export const SONICARE_MODEL_PREFIX = 'philips.toothbrush.';

export const BRUSH_STACKS = ['classic', 'condor'] as const;

export type BrushStack = (typeof BRUSH_STACKS)[number];

export const SONICARE_MODES = [
  'clean',
  'white_plus',
  'gum_health',
  'tongue_care',
  'deep_clean_plus',
  'sensitive',
] as const;

export type SonicareMode = (typeof SONICARE_MODES)[number];

export const SONICARE_MODE_LABELS: Readonly<Record<SonicareMode, string>> = {
  clean: 'Clean',
  white_plus: 'White+',
  gum_health: 'Gum Health',
  tongue_care: 'Tongue Care',
  deep_clean_plus: 'Deep Clean+',
  sensitive: 'Sensitive',
};

export const SONICARE_ROUTINE_MODES: readonly SonicareMode[] = [...SONICARE_MODES];

export const SONICARE_FAMILIES = [
  'classic_open',
  'classic_bonded',
  'kids',
  'condor_7100',
  'condor_kids',
  'unknown',
] as const;

export type BrushFamily = (typeof SONICARE_FAMILIES)[number];

export const SONICARE_HEAD_LIFETIME_SECONDS = 21_600;

export const SENSOR_PRESSURE = 1;

export const SENSOR_TEMPERATURE = 2;

export const SENSOR_MOTION = 4;

export const SETTING_PRESSURE_FEEDBACK = 0x0200;

export const SETTING_SCRUBBING_FEEDBACK = 0x0800;

export const SETTING_ADAPTIVE_INTENSITY = 0x1000;

export const SONICARE_COMPANY_ID = 477;

export const CLASSIC_SERVICE = '477ea600-a260-11e4-ae37-0002a5d50001';

export const CONDOR_SERVICE = 'e50ba3c0-af04-4564-92ad-fef019489de6';

export const CONDOR_ADVERT_TEXT = 'Condor';

export const SONICARE_IDENTITY = z.strictObject({
  model: z.string().nullable(),
  serial: z.string().nullable(),
  firmware: z.string().nullable(),
  manufacturer: z.string().nullable(),
  pnp: HEX.nullable(),
  stack: z.enum(BRUSH_STACKS),
  bonded: z.boolean(),
  address: z.string().min(1),
  gapName: z.string().nullable(),
  services: z.array(GATT_UUID),
  ports: z.array(z.string()),
  routineIds: z.array(z.number().int().min(0).max(255)).nullable(),
  clockIsUnix: z.boolean().nullable(),
});

export type SonicareIdentity = z.infer<typeof SONICARE_IDENTITY>;

export const SONICARE_PROFILE = z.strictObject({
  ...BRUSH_PROFILE_SHARED,
  brand: z.literal('sonicare'),
  zoneSource: z.literal('estimated'),
  stack: z.enum(BRUSH_STACKS),
  family: z.enum(SONICARE_FAMILIES),
  bonded: z.boolean(),
  settingsWrite: z.boolean(),
  temperature: z.boolean(),
  motorRuntime: z.boolean(),
});

export type SonicareProfile = z.infer<typeof SONICARE_PROFILE>;

type ProfileBase = Omit<SonicareProfile, 'stack' | 'family' | 'bonded'>;

const CLASSIC_FULL: ProfileBase = {
  brand: 'sonicare',
  zoneSource: 'estimated',
  writes: false,
  settingsWrite: false,
  pressure: 'value',
  temperature: true,
  motion: true,
  head: 'full',
  history: 'retained',
  motorRuntime: true,
  zones: 6,
};

const KIDS: ProfileBase = {
  brand: 'sonicare',
  zoneSource: 'estimated',
  writes: false,
  settingsWrite: false,
  pressure: 'none',
  temperature: false,
  motion: false,
  head: 'none',
  history: 'retained',
  motorRuntime: true,
  zones: 4,
};

const CONDOR_7100: ProfileBase = {
  brand: 'sonicare',
  zoneSource: 'estimated',
  writes: false,
  settingsWrite: false,
  pressure: 'state',
  temperature: true,
  motion: false,
  head: 'usage',
  history: 'observed_only',
  motorRuntime: false,
  zones: 6,
};

const CONDOR_KIDS: ProfileBase = {
  ...KIDS,
  history: 'observed_only',
  motorRuntime: false,
};

export interface ModelChoice {
  readonly key: string;
  readonly model: string;
  readonly label: string;
  readonly stack: BrushStack;
}

export const MODEL_CHOICES: readonly ModelChoice[] = [
  { key: 'hx992x', model: 'HX992X', label: 'DiamondClean 9000 or Smart 9300', stack: 'classic' },
  { key: 'hx999x', model: 'HX999X', label: 'DiamondClean Prestige 9900', stack: 'classic' },
  { key: 'hx960x', model: 'HX960X', label: 'ExpertClean 7300 or 7500', stack: 'classic' },
  { key: 'hx6340', model: 'HX6340', label: 'Sonicare For Kids', stack: 'classic' },
  { key: 'hx742x', model: 'HX742X', label: 'Series 7100', stack: 'condor' },
  { key: 'hx6600', model: 'HX6600', label: 'Kids Smart', stack: 'condor' },
];

const PRESTIGE_PREFIX = 'HX999';

const BONDED_CLASSIC = /^(?:HX999|HX96[02]V|HX991M)/;

const FAMILY_RULES: readonly (readonly [RegExp, BrushFamily])[] = [
  [/^HX6600/, 'condor_kids'],
  [/^HX63/, 'kids'],
  [/^HX74/, 'condor_7100'],
  [BONDED_CLASSIC, 'classic_bonded'],
  [/^HX9[69]/, 'classic_open'],
];

export function brushFamilyOf(model: string | null): BrushFamily {
  const upper = (model ?? '').trim().toUpperCase();
  return FAMILY_RULES.find(([pattern]) => pattern.test(upper))?.[1] ?? 'unknown';
}

const CLASSIC_PARTS = {
  sensor: '477ea600-a260-11e4-ae37-0002a5d50005',
  head: '477ea600-a260-11e4-ae37-0002a5d50006',
  storage: '477ea600-a260-11e4-ae37-0002a5d50004',
  diagnostic: '477ea600-a260-11e4-ae37-0002a5d50007',
} as const;

function detectedBase(identity: SonicareIdentity): ProfileBase {
  const hasPort = (name: string): boolean => identity.ports.some((port) => port === name);
  const has = (service: string): boolean => identity.services.includes(service);
  const classic = identity.stack === 'classic';
  const sensor = classic ? has(CLASSIC_PARTS.sensor) : hasPort('SensorData');
  return {
    brand: 'sonicare',
    zoneSource: 'estimated',
    writes: false,
    settingsWrite: false,
    pressure: sensor ? (classic ? 'value' : 'state') : 'none',
    temperature: sensor,
    motion: false,
    head: (classic ? has(CLASSIC_PARTS.head) : hasPort('BrushHead')) ? 'usage' : 'none',
    history: classic && has(CLASSIC_PARTS.storage) ? 'retained' : 'observed_only',
    motorRuntime: classic,
    zones: 6,
  };
}

function baseOf(family: BrushFamily, identity: SonicareIdentity): ProfileBase {
  switch (family) {
    case 'classic_open':
    case 'classic_bonded':
      return CLASSIC_FULL;
    case 'kids':
      return KIDS;
    case 'condor_7100':
      return CONDOR_7100;
    case 'condor_kids':
      return CONDOR_KIDS;
    case 'unknown':
      return detectedBase(identity);
  }
}

export function sonicareProfileOf(identity: SonicareIdentity): SonicareProfile {
  const family = brushFamilyOf(identity.model);
  const upper = (identity.model ?? '').trim().toUpperCase();
  const prestige = upper.startsWith(PRESTIGE_PREFIX);
  const base = baseOf(family, identity);
  return {
    ...base,
    stack: identity.stack,
    family,
    bonded: family === 'unknown' ? identity.bonded : identity.bonded || BONDED_CLASSIC.test(upper),
    writes: prestige,
    settingsWrite: prestige,
  };
}

export function modelOf(identity: SonicareIdentity): string {
  return (identity.model ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '');
}

export function sonicareModelKey(identity: SonicareIdentity): string {
  const slug = modelOf(identity);
  return `${SONICARE_MODEL_PREFIX}${slug === '' ? 'unknown' : slug.replace(/[a-z]$/, 'x')}`;
}

export function sonicareExternalId(identity: SonicareIdentity): string {
  return `${SONICARE_DRIVER}:${identity.serial ?? identity.address}`;
}

export function modesOfRoutines(ids: readonly number[]): readonly SonicareMode[] {
  const modes = ids.flatMap((id) => {
    const mode = SONICARE_ROUTINE_MODES[id];
    return mode === undefined ? [] : [mode];
  });
  return [...new Set(modes)];
}
