import {
  BOTTLE_CHARGING,
  BOTTLE_LINKS,
  type BottleCharging,
  type BottleLink,
} from '@smarteverything/domain';
import type { BottleFacts, BottleLight, BottleUvMode } from '../../types';
import type { ObservedValues } from '../lookup';
import type { Decorate } from './decorate';

const LIGHT_OF_STATE: Readonly<Record<string, BottleLight>> = {
  uv_maintenance: 'uv',
  uv_normal: 'uv',
  uv_adventure: 'uv',
  hydration_reminder: 'reminder',
  battery_low: 'low_battery',
  charging: 'charging',
  charged: 'charged',
  uv_interlock: 'interlock',
  fault: 'fault',
  locked: 'locked',
};

const UV_OF_STATE: Readonly<Record<string, BottleUvMode>> = {
  uv_maintenance: 'maintenance',
  uv_normal: 'normal',
  uv_adventure: 'adventure',
};

const SEARCHING_LINKS: ReadonlySet<BottleLink> = new Set(['no_phone']);

function chargingOf(text: unknown): BottleCharging {
  return BOTTLE_CHARGING.find((known) => known === text) ?? 'not_charging';
}

function linkOf(text: unknown): BottleLink | null {
  return BOTTLE_LINKS.find((known) => known === text) ?? null;
}

function lightOf(state: unknown, charging: BottleCharging): BottleLight {
  const stated = typeof state === 'string' ? LIGHT_OF_STATE[state] : undefined;
  if (stated !== undefined && stated !== 'charging' && stated !== 'charged') {
    return stated;
  }
  if (charging !== 'not_charging') {
    return charging;
  }
  return stated ?? 'off';
}

export function bottleFacts(values: ObservedValues): BottleFacts {
  const valueByKey = (key: string): unknown => values[key]?.value ?? null;
  const state = valueByKey('bottle_state');
  const percent = valueByKey('water_level');
  const link = linkOf(valueByKey('bottle_link'));
  const charging = chargingOf(valueByKey('bottle_charging'));
  const battery = valueByKey('battery');
  return {
    fill: typeof percent === 'number' ? Math.min(1, Math.max(0, percent / 100)) : null,
    reliable: valueByKey('bottle_reliable') !== false,
    light: lightOf(state, charging),
    uvMode: typeof state === 'string' ? (UV_OF_STATE[state] ?? null) : null,
    battery: typeof battery === 'number' ? battery : null,
    filter: false,
    searching: link !== null && SEARCHING_LINKS.has(link),
    syncing: link === 'syncing',
    tilt: 'upright',
  };
}

export const bottleState: Decorate = (base, lookup) => ({
  ...base,
  power: 'on',
  bottle: bottleFacts(lookup.values),
});
