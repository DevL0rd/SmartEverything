import {
  BRUSH_ACTIVITIES,
  BRUSH_HEADS,
  BRUSH_HEAD_TYPES,
  BRUSH_INTENSITIES,
  BRUSH_LINK_PHASES,
  BRUSH_MODES,
  ORALB_RING_COLOURS,
  ORALB_RING_NAMES,
  oralbRingDisplayOf,
  type BrushBrand,
} from '@smarteverything/domain';
import type { ToothbrushFacts } from '../../types';
import type { Lookup, ObservedValues } from '../lookup';
import type { Decorate } from './decorate';

function valueOf(values: ObservedValues, key: string): unknown {
  return values[key]?.value ?? null;
}

function pick<T extends string>(known: readonly T[], value: unknown): T | null {
  return known.find((candidate) => candidate === value) ?? null;
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function ringOf(values: ObservedValues): string | null {
  const name = pick(ORALB_RING_NAMES, valueOf(values, 'brush_ring_colour'));
  if (name === null) {
    return null;
  }
  return `#${oralbRingDisplayOf(ORALB_RING_COLOURS[name])
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

export function toothbrushFacts(values: ObservedValues, brand: BrushBrand): ToothbrushFacts {
  const wear = numberOf(valueOf(values, 'brush_head_wear'));
  return {
    brand,
    activity: pick(BRUSH_ACTIVITIES, valueOf(values, 'brush_activity')) ?? 'asleep',
    link: pick(BRUSH_LINK_PHASES, valueOf(values, 'brush_link')) ?? 'asleep',
    mode: pick(BRUSH_MODES, valueOf(values, 'brush_mode')),
    intensity: pick(BRUSH_INTENSITIES, valueOf(values, 'brush_intensity')),
    pressure: null,
    head: pick(BRUSH_HEADS, valueOf(values, 'brush_head')),
    headType: pick(BRUSH_HEAD_TYPES, valueOf(values, 'brush_head_type')),
    wear: wear === null ? null : Math.min(1, Math.max(0, wear / 100)),
    battery: numberOf(valueOf(values, 'battery')),
    fault: valueOf(values, 'brush_fault') === true,
    ring: ringOf(values),
    face: null,
    sector: null,
    daysLeftRatio: null,
    elapsedS: null,
    display: true,
    handle: null,
  };
}

const RING_CAPABILITY = 'brush_ring_colour';

function brandOf(lookup: Lookup): BrushBrand {
  return lookup.presentation.capabilities.some((capability) => capability.key === RING_CAPABILITY)
    ? 'oralb'
    : 'sonicare';
}

export const toothbrushState: Decorate = (base, lookup) => {
  const facts = toothbrushFacts(lookup.values, brandOf(lookup));
  const awake =
    facts.activity === 'brushing' || facts.activity === 'paused' || facts.activity === 'standby';
  return { ...base, power: awake ? 'on' : 'off', toothbrush: facts };
};
