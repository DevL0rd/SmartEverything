import type { StateUpdate } from '@smarteverything/domain';
import {
  buildDeviceModel,
  convertDataPoints,
  reportFromDps,
  decodeReport,
  type CloudDevice,
  type DataPoint,
  type DeviceModel,
  type InventoryEntry,
  type ReportedValue,
  type RejectedDataPoint,
  type SmartLifeFacts,
} from '@smarteverything/tuya';
import type { Logger } from '@smarteverything/logging';
import type { LoadedDevice } from './cloud-inventory';
import { describeLocalError } from './local-link';

export interface DeviceRecord {
  readonly cloud: CloudDevice;
  readonly points: readonly DataPoint[];
  readonly model: DeviceModel;
  readonly rejected: readonly RejectedDataPoint[];
  readonly specificationPublished: boolean;
  readonly room: string | null;
  readonly observed: ReadonlySet<number>;
  readonly smartLife: SmartLifeFacts | null;
}

export class TuyaDeviceUnknownError extends Error {
  override readonly name = 'TuyaDeviceUnknownError';

  constructor(readonly externalId: string) {
    super(`No Tuya device or IR remote with id ${externalId} is in this account's inventory.`);
  }
}

export function recordOf(loaded: LoadedDevice): DeviceRecord {
  return {
    cloud: loaded.cloud,
    points: loaded.points,
    model: buildDeviceModel(loaded.cloud.category, loaded.points, new Set()),
    rejected: loaded.rejected,
    specificationPublished: loaded.specificationPublished,
    room: loaded.room,
    observed: new Set(),
    smartLife: loaded.smartLife,
  };
}

export function withObserved(record: DeviceRecord, dpIds: readonly number[]): DeviceRecord {
  if (dpIds.every((dpId) => record.observed.has(dpId))) {
    return record;
  }
  const observed = new Set([...record.observed, ...dpIds]);
  return {
    ...record,
    observed,
    model: buildDeviceModel(record.cloud.category, record.points, observed),
  };
}

export function entryOf(record: DeviceRecord): InventoryEntry {
  return {
    device: record.cloud,
    model: record.model,
    rejected: record.rejected,
    specificationPublished: record.specificationPublished,
    room: record.room,
    smartLife: record.smartLife,
  };
}

export function stateUpdates(
  record: DeviceRecord,
  report: readonly ReportedValue[],
  observedAt: string,
  log: Logger,
): readonly StateUpdate[] {
  const decoded = decodeReport(record.model, report);
  for (const problem of decoded.problems) {
    log.warn('tuya.value_unreadable', {
      deviceId: record.cloud.id,
      code: problem.code,
      reason: describeLocalError(problem.error),
    });
  }
  return decoded.values.map((value) => ({
    externalId: record.cloud.id,
    capability: value.capability,
    value: value.value,
    observedAt,
  }));
}

export function reportOf(
  record: DeviceRecord,
  dps: Readonly<Record<string, unknown>>,
  log: Logger,
): { readonly report: readonly ReportedValue[]; readonly unknownDpIds: readonly number[] } {
  if (record.smartLife === null) {
    return reportFromDps(record.model, dps);
  }
  const converted = convertDataPoints(record.smartLife.conversions, dps);
  for (const problem of converted.problems) {
    log.warn('tuya.value_unconverted', {
      deviceId: record.cloud.id,
      dpId: problem.dpId,
      reason: problem.error.reason,
    });
  }
  return converted;
}
