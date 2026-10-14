import {
  presentValue,
  withRole,
  type CapabilityRole,
  type DeviceFamily,
} from '@smarteverything/domain';
import { joinParts } from '../../../format/text';
import type { DeviceValues } from '../../../store/state';
import { valueOf, type DeviceModel } from './device-model';

interface SummaryPart {
  readonly role: CapabilityRole;
  readonly prefix: string;
}

const SUMMARY_PARTS: Readonly<Partial<Record<DeviceFamily, readonly SummaryPart[]>>> = {
  diffuser: [
    { role: 'spray_duration', prefix: '' },
    { role: 'spray_interval', prefix: 'every ' },
  ],
};

export function observedSummary(model: DeviceModel, values: DeviceValues): string | null {
  const parts = SUMMARY_PARTS[model.family] ?? [];
  const summary = joinParts(
    parts.map((part) => {
      const presented = withRole(model.presentation, part.role);
      const value = valueOf(values, presented);
      return presented === undefined || typeof value !== 'number'
        ? null
        : `${part.prefix}${presentValue(presented, value)}`;
    }),
  );
  return summary === '' ? null : summary;
}
