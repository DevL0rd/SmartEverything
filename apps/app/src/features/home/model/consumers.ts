import { withRole } from '@smarteverything/domain';
import { memoOnInputs } from '../../../store/memo-selector';
import type { DeviceValues } from '../../../store/state';
import type { DeviceModel } from '../../devices';
import { DeviceFold } from './device-fold';
import { homeDeviceModels } from './devices';
import { CONSUMERS_SHOWN } from './widget-fit';

export interface Consumer {
  readonly deviceId: string;
  readonly name: string;
  readonly value: number;
  readonly unit: string | null;
}

function consumerOf(model: DeviceModel, values: DeviceValues): Consumer | null {
  const { device, presentation } = model;
  const presented = withRole(presentation, 'power_draw');
  const value = presented === undefined ? undefined : values[presented.key]?.value;
  if (!device.online || presented === undefined || typeof value !== 'number') {
    return null;
  }
  return { deviceId: device.id, name: device.label, value, unit: presented.unit };
}

const consumers = new DeviceFold<Consumer>({
  models: (state): readonly DeviceModel[] => homeDeviceModels(state),
  includes: (model): boolean => withRole(model.presentation, 'power_draw') !== undefined,
  usesValues: (): boolean => true,
  projected: false,
  contribution: consumerOf,
  same: (left, right): boolean =>
    left.value === right.value && left.name === right.name && left.unit === right.unit,
});

export function topConsumers(
  consumers: readonly Consumer[],
  limit: number = CONSUMERS_SHOWN,
): readonly Consumer[] {
  return consumers
    .filter((consumer) => Number.isFinite(consumer.value))
    .sort((left, right) => right.value - left.value)
    .slice(0, limit);
}

export const consumersOf = memoOnInputs(
  (state) => [consumers.read(state)],
  (state): readonly Consumer[] =>
    topConsumers(consumers.read(state).entries.map((entry) => entry.value)),
);

export function sameConsumers(left: readonly Consumer[], right: readonly Consumer[]): boolean {
  return (
    left.length === right.length &&
    left.every((consumer, index) => {
      const other = right[index];
      return (
        other?.deviceId === consumer.deviceId &&
        other.name === consumer.name &&
        other.value === consumer.value &&
        other.unit === consumer.unit
      );
    })
  );
}
