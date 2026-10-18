import { isDeepStrictEqual } from 'node:util';
import type { ShellyDevice } from '@smarteverything/shelly';
import { valueComponent } from './component-projection';

type Component = ShellyDevice['components'][number];
type Light = ShellyDevice['light'][number];
type Zone = ShellyDevice['zones'][number];

function withoutKeys(
  status: object | null,
  keys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  if (status === null) return null;
  return Object.fromEntries(Object.entries(status).filter(([key]) => !keys.includes(key)));
}

function zoneChanged(before: Zone, after: Zone): boolean {
  return before !== after && (before.status === null) !== (after.status === null);
}

function lightChanged(before: Light, after: Light, first: boolean): boolean {
  if (before === after) return false;
  if (!first) return true;
  const keys = ['lux', 'illumination'];
  return !isDeepStrictEqual(withoutKeys(before.status, keys), withoutKeys(after.status, keys));
}

function componentChanged(before: Component, after: Component): boolean {
  if (before === after) return false;
  if (!valueComponent(after)) return true;
  return !isDeepStrictEqual(
    withoutKeys(before.status, ['value']),
    withoutKeys(after.status, ['value']),
  );
}

function listChanged<T>(
  before: readonly T[],
  after: readonly T[],
  changed: (before: T, after: T, index: number) => boolean,
): boolean {
  if (before === after) return false;
  if (before.length !== after.length) return true;
  return before.some((item, index) => {
    const next = after[index];
    return next === undefined || changed(item, next, index);
  });
}

export function inventoryVisibleChange(before: ShellyDevice, after: ShellyDevice): boolean {
  return (
    before.status !== after.status ||
    before.discoveredBthome !== after.discoveredBthome ||
    listChanged(before.zones, after.zones, zoneChanged) ||
    listChanged(before.light, after.light, (a, b, index) => lightChanged(a, b, index === 0)) ||
    listChanged(before.components, after.components, componentChanged)
  );
}
