import {
  chooseTransport,
  isSleepingSensor,
  isUsableLocalKey,
  type LanAnnouncement,
  type TransportChoice,
  type TransportFacts,
} from '@smarteverything/tuya';
import type { LinkTarget } from './local-link';
import type { DeviceRecord } from './records';

export interface TransportInputs {
  readonly records: ReadonlyMap<string, DeviceRecord>;
  readonly lan: ReadonlyMap<string, LanAnnouncement>;
  readonly rejectedKeys: ReadonlyMap<string, string>;
}

function factsOf(
  record: DeviceRecord,
  inputs: TransportInputs,
  planned: ReadonlyMap<string, TransportChoice>,
): TransportFacts {
  const key = record.cloud.local_key;
  const gateway = record.cloud.gateway_id;
  return {
    sub: record.cloud.sub,
    hasLocalKey: isUsableLocalKey(key),
    keyRejected: key !== null && inputs.rejectedKeys.get(record.cloud.id) === key,
    sleepingSensor: isSleepingSensor(record.model),
    seenOnLan: inputs.lan.has(record.cloud.id),
    hasNodeId: record.cloud.node_id !== null,
    hasGatewayId: gateway !== null,
    gatewayLocal: gateway !== null && planned.get(gateway)?.transport === 'local',
  };
}

export function planTransports(inputs: TransportInputs): ReadonlyMap<string, TransportChoice> {
  const planned = new Map<string, TransportChoice>();
  const ordered = [...inputs.records.values()].sort(
    (left, right) => Number(left.cloud.sub) - Number(right.cloud.sub),
  );
  for (const record of ordered) {
    planned.set(record.cloud.id, chooseTransport(factsOf(record, inputs, planned)));
  }
  return planned;
}

export function sameChoice(left: TransportChoice | undefined, right: TransportChoice): boolean {
  return left?.transport === right.transport && left.reason === right.reason;
}

export function linkTargetOf(
  record: DeviceRecord,
  choice: TransportChoice | undefined,
  announcement: LanAnnouncement | undefined,
): LinkTarget | null {
  const key = record.cloud.local_key;
  if (
    record.cloud.sub ||
    choice?.transport !== 'local' ||
    announcement === undefined ||
    key === null
  ) {
    return null;
  }
  return { deviceId: record.cloud.id, key, ip: announcement.ip, version: announcement.version };
}
