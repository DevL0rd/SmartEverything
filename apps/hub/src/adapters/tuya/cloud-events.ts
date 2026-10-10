import type { Logger } from '@smarteverything/logging';
import type { CloudMessage, ReportedValue, TransportChoice } from '@smarteverything/tuya';
import type { TuyaDependencies } from './dependencies';
import type { DeviceRecord } from './records';

interface CloudTarget {
  readonly log: Logger;
  readonly options: { readonly dependencies: Pick<TuyaDependencies, 'timing'> };
  resync(): void;
  record(externalId: string): DeviceRecord | undefined;
  choiceOf(deviceId: string): TransportChoice;
  applyReport(record: DeviceRecord, report: readonly ReportedValue[], pushed: boolean): void;
  applyDataPoints(
    found: DeviceRecord,
    dps: Readonly<Record<string, unknown>>,
    pushed: boolean,
  ): void;
  presence(
    deviceId: string,
    kind: 'device_online' | 'device_offline',
    transport: 'local' | 'cloud',
  ): void;
}

function scheduleResync(runtime: CloudTarget, deviceId: string, bizCode: string): void {
  const delayMs = runtime.options.dependencies.timing.inventorySettleMs;
  runtime.log.info('tuya.inventory_changed', { deviceId, bizCode, delayMs });
  setTimeout(() => {
    runtime.resync();
  }, delayMs);
}

export function routeCloudMessage(runtime: CloudTarget, message: CloudMessage): void {
  if (message.kind === 'other') {
    runtime.log.debug('tuya.message_ignored', { bizCode: message.bizCode });
    return;
  }
  if (message.kind === 'inventory_changed') {
    scheduleResync(runtime, message.deviceId, message.bizCode);
    return;
  }
  const record = runtime.record(message.deviceId);
  if (record === undefined || runtime.choiceOf(message.deviceId).transport !== 'cloud') {
    runtime.log.debug('tuya.message_not_for_cloud_device', {
      deviceId: message.deviceId,
      kind: message.kind,
    });
    return;
  }
  switch (message.kind) {
    case 'status':
      runtime.applyReport(record, message.items, true);
      return;
    case 'data_points':
      runtime.applyDataPoints(record, message.dps, true);
      return;
    case 'online':
    case 'offline':
      runtime.presence(
        message.deviceId,
        message.kind === 'online' ? 'device_online' : 'device_offline',
        'cloud',
      );
  }
}
