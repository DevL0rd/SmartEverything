import { withRole } from '@smarteverything/domain';
import { memoOnInputs } from '../../../store/memo-selector';
import type { Device, DeviceValues } from '../../../store/state';
import type { DeviceModel } from '../../devices';
import { DeviceFold } from './device-fold';
import { homeDeviceModels } from './devices';

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

function drawOf(model: DeviceModel, values: DeviceValues): Draw | null {
  const presented = withRole(model.presentation, 'power_draw');
  const value = presented === undefined ? undefined : values[presented.key]?.value;
  if (
    presented === undefined ||
    !model.device.online ||
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return null;
  }
  return { device: model.device, key: presented.key, value, unit: presented.unit };
}

const draws = new DeviceFold<Draw>({
  models: (state): readonly DeviceModel[] => homeDeviceModels(state),
  includes: (model): boolean => withRole(model.presentation, 'power_draw') !== undefined,
  usesValues: (): boolean => true,
  projected: false,
  contribution: drawOf,
  same: (left, right): boolean =>
    left.value === right.value && left.key === right.key && left.unit === right.unit,
});

export const powerOf = memoOnInputs(
  (state) => [draws.read(state)],
  (state): PowerUse | null => {
    const found = draws.read(state).entries.map((entry) => entry.value);
    const [first] = found;
    if (first === undefined) {
      return null;
    }
    return {
      watts: found.reduce((total, draw) => total + draw.value, 0),
      keys: [...new Set(found.map((draw) => draw.key))],
      unit: first.unit,
      sources: found.map((draw) => draw.device),
    };
  },
);

export function samePower(left: PowerUse | null, right: PowerUse | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    Math.round(left.watts) === Math.round(right.watts) &&
    left.unit === right.unit &&
    left.sources.length === right.sources.length &&
    left.sources.every((device, index) => device === right.sources[index])
  );
}
