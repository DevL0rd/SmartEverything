import { familyDefinition, presentValue, withRole } from '@smarteverything/domain';
import { joinParts } from '../../../format/text';
import type { DeviceValues } from '../../../store/state';
import { valueOf, type DeviceModel } from './device-model';

export function observedSummary(model: DeviceModel, values: DeviceValues): string | null {
  const summary = joinParts(
    familyDefinition(model.family).summary.map((part) => {
      const presented = withRole(model.presentation, part.role);
      const value = valueOf(values, presented);
      return presented === undefined || typeof value !== 'number'
        ? null
        : `${part.prefix}${presentValue(presented, value)}`;
    }),
  );
  return summary === '' ? null : summary;
}
