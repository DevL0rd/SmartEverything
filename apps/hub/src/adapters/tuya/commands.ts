import type { DeviceCommand, JsonValue, StateUpdate } from '@smarteverything/domain';
import { encodeCommand } from '@smarteverything/tuya';
import { learnIr, sendIr } from './ir-control';
import { writeTo } from './writes';
import { TuyaDeviceUnknownError, reportOf, stateUpdates, type DeviceRecord } from './records';
import type { TuyaRuntime } from './runtime';
import { messageOf } from '@smarteverything/logging';

export async function executeCommand(
  runtime: TuyaRuntime,
  command: DeviceCommand,
): Promise<JsonValue> {
  const record = runtime.record(command.externalId);
  if (record === undefined) {
    throw new TuyaDeviceUnknownError(command.externalId);
  }
  if (command.capability === 'ir_learn') {
    return learnIr(runtime, record);
  }
  if (command.capability === 'ir_send') {
    return sendIr(runtime, record, command.value);
  }
  await writeTo(runtime, record, (transport) =>
    encodeCommand(record.model, command.capability, command.value, transport),
  );
  return null;
}

async function refreshLocal(
  runtime: TuyaRuntime,
  record: DeviceRecord,
  observedAt: string,
): Promise<readonly StateUpdate[]> {
  try {
    const { link, cid } = runtime.route(record);
    const { report } = reportOf(record, await link.query(cid), runtime.log);
    return stateUpdates(record, report, observedAt, runtime.log);
  } catch (cause) {
    runtime.log.warn('tuya.refresh_failed', {
      deviceId: record.cloud.id,
      reason: messageOf(cause),
    });
    return [];
  }
}

async function refreshCloud(
  runtime: TuyaRuntime,
  records: readonly DeviceRecord[],
  observedAt: string,
): Promise<readonly StateUpdate[]> {
  if (records.length === 0) {
    return [];
  }
  const statuses = await runtime.backend.statuses(records.map((record) => record.cloud.id));
  return statuses.flatMap((status) => {
    const record = runtime.record(status.id);
    return record === undefined ? [] : stateUpdates(record, status.status, observedAt, runtime.log);
  });
}

export async function refreshStates(
  runtime: TuyaRuntime,
  externalIds: readonly string[],
  observedAt: string,
): Promise<readonly StateUpdate[]> {
  const records = externalIds
    .map((externalId) => runtime.record(externalId))
    .filter((record): record is DeviceRecord => record !== undefined);
  const local = records.filter((record) => runtime.choiceOf(record.cloud.id).transport === 'local');
  const cloud = records.filter((record) => runtime.choiceOf(record.cloud.id).transport === 'cloud');
  const updates: StateUpdate[] = [];
  for (const record of local) {
    updates.push(...(await refreshLocal(runtime, record, observedAt)));
  }
  updates.push(...(await refreshCloud(runtime, cloud, observedAt)));
  return updates;
}
