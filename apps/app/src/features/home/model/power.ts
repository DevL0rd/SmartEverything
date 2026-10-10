import { withRole } from '@smarteverything/domain';
import { rowsOf, type Device, type StoreState } from '../../../store/state';
import { deviceModelOf } from '../../devices';

export interface PowerUse {
  readonly watts: number;
  readonly keys: readonly string[];
  readonly unit: string | null;
  readonly sources: readonly Device[];
}

interface Draw {
  readonly device: Device;
  readonly key: string;
  readonly value: number;
  readonly unit: string | null;
}

function drawOf(state: StoreState, device: Device): Draw | null {
  const presented = withRole(deviceModelOf(device).presentation, 'power_draw');
  const value =
    presented === undefined ? undefined : state.deviceValues[device.id]?.[presented.key]?.value;
  if (presented === undefined || typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return { device, key: presented.key, value, unit: presented.unit };
}

export function powerOf(state: StoreState): PowerUse | null {
  const draws = rowsOf(state.tables.devices).flatMap((device) => {
    const draw = device.online && !device.hidden ? drawOf(state, device) : null;
    return draw === null ? [] : [draw];
  });
  const [first] = draws;
  if (first === undefined) {
    return null;
  }
  return {
    watts: draws.reduce((total, draw) => total + draw.value, 0),
    keys: [...new Set(draws.map((draw) => draw.key))],
    unit: first.unit,
    sources: draws.map((draw) => draw.device),
  };
}

export function samePower(left: PowerUse | null, right: PowerUse | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.watts === right.watts &&
    left.unit === right.unit &&
    left.sources.length === right.sources.length &&
    left.sources.every((device, index) => device === right.sources[index])
  );
}
