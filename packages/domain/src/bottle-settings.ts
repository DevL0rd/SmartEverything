import { z } from 'zod';
import { BOTTLE_FILTER_LIMITS } from './bottle';
import { BOTTLE_DAY, bottleDayAfter, bottleDayIndex } from './bottle-days';

const SECONDS_PER_DAY = 86_400;

const SECONDS_PER_MINUTE = 60;

const MINUTES_PER_HOUR = 60;

const CHANNEL_MAX = 255;

const BLUE_SHIFT = 0;

export const BOTTLE_CLOCK = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'a clock time such as 08:30');

export function secondsOfBottleClock(clock: string): number {
  const hours = Number(clock.slice(0, 2));
  const minutes = Number(clock.slice(3, 5));
  const seconds = (hours * MINUTES_PER_HOUR + minutes) * SECONDS_PER_MINUTE;
  return seconds === 0 ? SECONDS_PER_DAY : seconds;
}

export function bottleClockOfSeconds(seconds: number): string {
  const inDay = seconds % SECONDS_PER_DAY;
  const minutes = Math.floor(inDay / SECONDS_PER_MINUTE);
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  return `${String(hours).padStart(2, '0')}:${String(minutes % MINUTES_PER_HOUR).padStart(2, '0')}`;
}

export const BOTTLE_HEX = z.string().regex(/^#[0-9a-f]{6}$/, 'a lower-case colour such as #46b8ff');

export const BOTTLE_COLOURS = [
  { id: 'white', label: 'White', hex: '#ffffff' },
  { id: 'sky', label: 'Sky', hex: '#46b8ff' },
  { id: 'mint', label: 'Mint', hex: '#7cf0b4' },
  { id: 'amber', label: 'Amber', hex: '#ffd75e' },
  { id: 'rose', label: 'Rose', hex: '#ff8fb1' },
  { id: 'lilac', label: 'Lilac', hex: '#b69cff' },
] as const;

export interface BottleChannels {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

export function bottleChannelsOfHex(hex: string): BottleChannels {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    red: ((value >> 16) & 0xff) / CHANNEL_MAX,
    green: ((value >> 8) & 0xff) / CHANNEL_MAX,
    blue: ((value >> BLUE_SHIFT) & 0xff) / CHANNEL_MAX,
  };
}

export function bottleHexOfChannels(channels: BottleChannels): string {
  const part = (value: number): string =>
    Math.round(Math.min(1, Math.max(0, value)) * CHANNEL_MAX)
      .toString(16)
      .padStart(2, '0');
  return `#${part(channels.red)}${part(channels.green)}${part(channels.blue)}`;
}

export const BOTTLE_REMINDER_STATE = z.enum(['off', 'interval_fixed']);

export const BOTTLE_REMINDER_INTERVAL = z.int().min(15).max(120).multipleOf(5);

export const BOTTLE_REMINDER = z.strictObject({
  state: z.string().min(1),
  intervalMin: z.int().nonnegative(),
  from: BOTTLE_CLOCK,
  to: BOTTLE_CLOCK,
  colour: BOTTLE_HEX,
});

export type BottleReminder = z.infer<typeof BOTTLE_REMINDER>;

export const BOTTLE_REMINDER_CHANGE = z.strictObject({
  state: BOTTLE_REMINDER_STATE.optional(),
  intervalMin: BOTTLE_REMINDER_INTERVAL.optional(),
  from: BOTTLE_CLOCK.optional(),
  to: BOTTLE_CLOCK.optional(),
  colour: BOTTLE_HEX.optional(),
});

export type BottleReminderChange = z.infer<typeof BOTTLE_REMINDER_CHANGE>;

export const BOTTLE_QUIET_STATE = z.enum(['off', 'on', 'auto']);

export const BOTTLE_QUIET = z.strictObject({
  state: z.string().min(1),
  from: BOTTLE_CLOCK,
  to: BOTTLE_CLOCK,
  snoozeMin: z.int().nonnegative(),
});

export type BottleQuiet = z.infer<typeof BOTTLE_QUIET>;

export const BOTTLE_QUIET_CHANGE = z.strictObject({
  state: BOTTLE_QUIET_STATE.optional(),
  from: BOTTLE_CLOCK.optional(),
  to: BOTTLE_CLOCK.optional(),
});

export type BottleQuietChange = z.infer<typeof BOTTLE_QUIET_CHANGE>;

export const BOTTLE_FILTER_TYPE = z.enum(['essential', 'advanced']);

export const BOTTLE_FILTER_CONFIG = z.strictObject({
  installed: z.boolean(),
  type: BOTTLE_FILTER_TYPE,
  installedOn: BOTTLE_DAY.nullable(),
});

export type BottleFilterConfig = z.infer<typeof BOTTLE_FILTER_CONFIG>;

export const BOTTLE_FILTER_STATUS = z.strictObject({
  type: BOTTLE_FILTER_TYPE,
  installedOn: BOTTLE_DAY.nullable(),
  litresUsed: z.number().nonnegative(),
  litresLimit: z.number().positive(),
  daysUsed: z.int().nonnegative(),
  daysLimit: z.int().positive(),
  usedPct: z.number().nonnegative(),
  replaceBy: BOTTLE_DAY.nullable(),
  due: z.boolean(),
});

export type BottleFilterStatus = z.infer<typeof BOTTLE_FILTER_STATUS>;

export const DEFAULT_FILTER: BottleFilterConfig = {
  installed: false,
  type: 'essential',
  installedOn: null,
};

const ML_PER_LITRE = 1000;

const PROJECTION_DAYS = 14;

export function bottleFilterStatusOf(
  config: BottleFilterConfig,
  drunkMlSince: number,
  drunkMlRecent: number,
  today: string,
): BottleFilterStatus | null {
  if (!config.installed || config.installedOn === null) {
    return null;
  }
  const limits = BOTTLE_FILTER_LIMITS[config.type];
  const litresUsed = drunkMlSince / ML_PER_LITRE;
  const daysUsed = Math.max(0, bottleDayIndex(today) - bottleDayIndex(config.installedOn));
  const perDay = drunkMlRecent / ML_PER_LITRE / PROJECTION_DAYS;
  const byDays = bottleDayAfter(config.installedOn, limits.days);
  const litresLeft = Math.max(0, limits.litres - litresUsed);
  const byLitres = perDay > 0 ? bottleDayAfter(today, Math.ceil(litresLeft / perDay)) : null;
  return {
    type: config.type,
    installedOn: config.installedOn,
    litresUsed,
    litresLimit: limits.litres,
    daysUsed,
    daysLimit: limits.days,
    usedPct: Math.max(litresUsed / limits.litres, daysUsed / limits.days),
    replaceBy: byLitres !== null && byLitres < byDays ? byLitres : byDays,
    due: litresUsed >= limits.litres || daysUsed >= limits.days,
  };
}

export const BOTTLE_BINDING = z.strictObject({
  profileId: z.uuid().nullable(),
  boundBy: z.uuid().nullable(),
  boundAt: z.iso.datetime({ offset: true }).nullable(),
  keptAt: z.iso.datetime({ offset: true }).nullable(),
});

export type BottleBinding = z.infer<typeof BOTTLE_BINDING>;

export const UNBOUND: BottleBinding = {
  profileId: null,
  boundBy: null,
  boundAt: null,
  keptAt: null,
};

export function bottleNoticePending(binding: BottleBinding, viewerProfileId: string): boolean {
  return (
    binding.profileId === viewerProfileId &&
    binding.boundBy !== viewerProfileId &&
    binding.keptAt === null
  );
}

export function bottleMayStartUv(
  binding: BottleBinding,
  viewer: { readonly owner: boolean; readonly profileId: string },
): boolean {
  return viewer.owner || binding.profileId === viewer.profileId;
}

export const BOTTLE_UV_REFUSALS = {
  fault: 'Cleaning is off while the cap reports a fault.',
  interlock: 'Cleaning is blocked while the cap is off a bottle or the liquid is too hot.',
  locked: 'Cleaning is off while Travel Lock is on.',
  charging: 'The cap cannot clean while it charges.',
} as const;

export type BottleUvRefusal = keyof typeof BOTTLE_UV_REFUSALS;
