import type { Transport } from './color';

export const TRANSPORT_REASONS = [
  'on_lan',
  'via_gateway',
  'no_local_key',
  'key_rejected',
  'sleeping_sensor',
  'not_on_lan',
  'gateway_not_on_lan',
  'no_node_id',
  'no_gateway_id',
  'cloud_library',
] as const;

export type TransportReason = (typeof TRANSPORT_REASONS)[number];

export interface TransportChoice {
  readonly transport: Transport;
  readonly reason: TransportReason;
}

export interface TransportFacts {
  readonly sub: boolean;
  readonly hasLocalKey: boolean;
  readonly keyRejected: boolean;
  readonly sleepingSensor: boolean;
  readonly seenOnLan: boolean;
  readonly hasNodeId: boolean;
  readonly hasGatewayId: boolean;
  readonly gatewayLocal: boolean;
}

export const RECONNECT_BASE_MS = 1000;

export const RECONNECT_MAX_MS = 60_000;

export function reconnectDelay(failures: number): number {
  return Math.min(RECONNECT_BASE_MS * 2 ** failures, RECONNECT_MAX_MS);
}

function cloud(reason: TransportReason): TransportChoice {
  return { transport: 'cloud', reason };
}

function subDeviceTransport(facts: TransportFacts): TransportChoice {
  if (!facts.hasNodeId) {
    return cloud('no_node_id');
  }
  if (!facts.hasGatewayId) {
    return cloud('no_gateway_id');
  }
  return facts.gatewayLocal
    ? { transport: 'local', reason: 'via_gateway' }
    : cloud('gateway_not_on_lan');
}

export function chooseTransport(facts: TransportFacts): TransportChoice {
  if (facts.sub) {
    return subDeviceTransport(facts);
  }
  if (!facts.hasLocalKey) {
    return cloud('no_local_key');
  }
  if (facts.keyRejected) {
    return cloud('key_rejected');
  }
  if (facts.sleepingSensor) {
    return cloud('sleeping_sensor');
  }
  return facts.seenOnLan ? { transport: 'local', reason: 'on_lan' } : cloud('not_on_lan');
}
