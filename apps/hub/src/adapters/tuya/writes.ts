import { isLanWritable, type DataPointWrite, type Transport } from '@smarteverything/tuya';
import type { LocalValue } from './local-client';
import type { DeviceRecord } from './records';
import type { TuyaRuntime } from './runtime';

export type WritesFor = (transport: Transport) => readonly DataPointWrite[];

class LocalValueError extends Error {
  override readonly name = 'LocalValueError';

  constructor(readonly code: string) {
    super(
      `The value for data point ${code} is structured and cannot be written over the LAN protocol.`,
    );
  }
}

interface LanWrite {
  readonly code: string;
  readonly dpId: number;
  readonly value: DataPointWrite['value'];
}

function lanWrites(record: DeviceRecord, writes: readonly DataPointWrite[]): LanWrite[] | null {
  const conversions = record.smartLife.conversions;
  const lan: LanWrite[] = [];
  for (const write of writes) {
    if (!isLanWritable(conversions, write.dpId)) {
      return null;
    }
    lan.push({ code: write.code, dpId: write.dpId, value: write.value });
  }
  return lan;
}

function localData(writes: readonly LanWrite[]): Record<string, LocalValue> {
  const data: Record<string, LocalValue> = {};
  for (const write of writes) {
    if (
      typeof write.value !== 'string' &&
      typeof write.value !== 'number' &&
      typeof write.value !== 'boolean'
    ) {
      throw new LocalValueError(write.code);
    }
    data[String(write.dpId)] = write.value;
  }
  return data;
}

export async function writeTo(
  runtime: TuyaRuntime,
  record: DeviceRecord,
  writesFor: WritesFor,
): Promise<void> {
  const deviceId = record.cloud.id;
  if (runtime.choiceOf(deviceId).transport === 'local') {
    const writes = writesFor('local');
    const lan = lanWrites(record, writes);
    if (lan !== null) {
      const { link, cid } = runtime.route(record);
      await link.write(cid, localData(lan));
      return;
    }
    runtime.log.info('tuya.write_through_cloud', {
      deviceId,
      codes: writes.map((write) => write.code),
      reason:
        'Tuya converts these values, or carries them only in the cloud, so they are sent by code',
    });
  }
  await runtime.backend.sendCommands(deviceId, writesFor('cloud'));
}
