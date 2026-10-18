import { PHONE_VALUES } from '@smarteverything/domain';
import type { z } from 'zod';
import type { PhoneFacts, PhoneRinger, VisualState } from '../../types';
import type { Lookup } from '../lookup';
import type { Decorate } from './decorate';

const SHAPE = PHONE_VALUES.shape;

const HOT_STATES: ReadonlySet<string> = new Set(['moderate', 'severe', 'critical']);

export const PHONE_UNKNOWN: PhoneFacts = {
  level: null,
  charging: false,
  ringer: null,
  ringing: false,
  torch: false,
  screenOn: true,
  playing: false,
  notifications: 0,
  inCall: false,
  hot: false,
  fold: null,
};

function read<S extends z.ZodType>(
  schema: S,
  lookup: Lookup,
  key: string,
): z.output<S> | undefined {
  const parsed = schema.safeParse(lookup.values[key]?.value);
  return parsed.success ? parsed.data : undefined;
}

function ringerOf(lookup: Lookup): PhoneRinger | null {
  if (read(SHAPE.dnd, lookup, 'dnd') === true) return 'dnd';
  return read(SHAPE.ringer_mode, lookup, 'ringer_mode') ?? null;
}

function phoneFactsOf(lookup: Lookup): PhoneFacts {
  return {
    level: read(SHAPE.battery, lookup, 'battery') ?? null,
    charging: lookup.values['charging']?.value === true,
    ringer: ringerOf(lookup),
    ringing: read(SHAPE.ringing, lookup, 'ringing') === true,
    torch: read(SHAPE.flashlight, lookup, 'flashlight') === 'on',
    screenOn: read(SHAPE.screen_on, lookup, 'screen_on') !== false,
    playing: read(SHAPE.playback, lookup, 'playback') === 'playing',
    notifications: read(SHAPE.notification_count, lookup, 'notification_count') ?? 0,
    inCall: read(SHAPE.in_call, lookup, 'in_call') === true,
    hot: HOT_STATES.has(read(SHAPE.thermal_state, lookup, 'thermal_state') ?? ''),
    fold: null,
  };
}

export const phoneState: Decorate = (base, lookup) => ({ ...base, phone: phoneFactsOf(lookup) });

export function phoneFacts(state: VisualState): PhoneFacts {
  return state.phone ?? PHONE_UNKNOWN;
}
