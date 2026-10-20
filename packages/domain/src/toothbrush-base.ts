import { z } from 'zod';

export const BRUSH_BRANDS = ['sonicare', 'oralb'] as const;

export type BrushBrand = (typeof BRUSH_BRANDS)[number];

export const BRUSH_INTENSITIES = ['low', 'medium', 'high'] as const;

export type BrushIntensity = (typeof BRUSH_INTENSITIES)[number];

export const BRUSH_ACTIVITIES = [
  'asleep',
  'standby',
  'brushing',
  'paused',
  'charging',
  'off',
] as const;

export type BrushActivity = (typeof BRUSH_ACTIVITIES)[number];

export const BRUSH_SESSION_STATES = [
  'idle',
  'running',
  'paused',
  'completed',
  'stopped_early',
] as const;

export type BrushSessionState = (typeof BRUSH_SESSION_STATES)[number];

export const BRUSH_PRESSURES = ['no_contact', 'optimal', 'too_high'] as const;

export type BrushPressure = (typeof BRUSH_PRESSURES)[number];

export const BRUSH_HEADS = ['fitted', 'missing', 'unrecognised'] as const;

export type BrushHead = (typeof BRUSH_HEADS)[number];

export const BRUSH_HEAD_TYPES = [
  'clean',
  'white',
  'gums',
  'tongue',
  'all_in_one',
  'sensitive',
  'other',
] as const;

export type BrushHeadType = (typeof BRUSH_HEAD_TYPES)[number];

export const BRUSH_LINK_PHASES = [
  'asleep',
  'searching',
  'connecting',
  'linked',
  'busy',
  'needs_pairing',
  'bluetooth_off',
] as const;

export type BrushLinkPhase = (typeof BRUSH_LINK_PHASES)[number];

export const BRUSH_POLICIES = ['on_demand', 'armed'] as const;

export type BrushPolicy = (typeof BRUSH_POLICIES)[number];

export const ZONE_SOURCES = ['estimated', 'pacer'] as const;

export type ZoneSource = (typeof ZONE_SOURCES)[number];

export const LIVE_SOURCES = ['advert', 'link'] as const;

export type LiveSource = (typeof LIVE_SOURCES)[number];

export const HEAD_WARN_PERCENT = 90;

export const HEAD_DUE_PERCENT = 100;

export const BATTERY_LOW_PERCENT = 20;

export const COUNTERFEIT_GRACE_SECONDS = 30;

export const PRESSURE_KINDS = ['value', 'state', 'force', 'none'] as const;

export const HEAD_KINDS = ['full', 'usage', 'countdown', 'none'] as const;

export const HISTORY_KINDS = ['retained', 'observed_only'] as const;

export const ZONE_COUNTS = z.union([z.literal(6), z.literal(4), z.literal(0)]);

export const BRUSH_PROFILE_SHARED = {
  pressure: z.enum(PRESSURE_KINDS),
  head: z.enum(HEAD_KINDS),
  history: z.enum(HISTORY_KINDS),
  zones: ZONE_COUNTS,
  zoneSource: z.enum(ZONE_SOURCES),
  writes: z.boolean(),
  motion: z.boolean(),
} as const;

export function headTypeOf(code: number): BrushHeadType {
  switch (code) {
    case 0:
      return 'clean';
    case 1:
      return 'white';
    case 2:
      return 'gums';
    case 3:
      return 'tongue';
    case 4:
      return 'all_in_one';
    case 5:
      return 'sensitive';
    default:
      return 'other';
  }
}
