import { randomUUID } from 'node:crypto';
import { createSocket, type Socket } from 'node:dgram';
import TuyaDevice from 'tuyapi';
import { backoffDelay } from '../../plugins/backoff';
import type { FetchLike } from '../../plugins/builtin/fetch-like';
import type { LocalClient, LocalClientOptions } from './local-client';
import { nodeMqttConnect, type MqttConnect } from './mqtt-connection';

interface TuyaTiming {
  readonly irLearnTimeoutMs: number;
  readonly qrScanQueryMs: number;
  readonly qrScanTimeoutMs: number;
  readonly messagingRenewMarginMs: number;
  readonly inventorySettleMs: number;
  readonly reconnectDelay: (failures: number) => number;
}

export interface TuyaDependencies {
  readonly fetch: FetchLike;
  readonly now: () => number;
  readonly nonce: () => string;
  readonly requestId: () => string;
  readonly timing: TuyaTiming;
  readonly localPort: number;
  readonly localClient: (options: LocalClientOptions) => LocalClient;
  readonly udpSocket: () => Socket;
  readonly discoveryPorts: readonly number[];
  readonly mqtt: MqttConnect;
}

const RECONNECT = { firstMs: 1000, longestMs: 60_000 } as const;

const DEFAULT_TIMING: TuyaTiming = {
  irLearnTimeoutMs: 30_000,
  qrScanQueryMs: 2_000,
  qrScanTimeoutMs: 300_000,
  messagingRenewMarginMs: 60_000,
  inventorySettleMs: 1_000,
  reconnectDelay: (failures) => backoffDelay(failures, RECONNECT),
};

const TUYA_LOCAL_PORT = 6668;

export function nodeDependencies(discoveryPorts: readonly number[]): TuyaDependencies {
  return {
    fetch: (url, init) => fetch(url, init),
    now: () => Date.now(),
    nonce: () => randomUUID().replaceAll('-', ''),
    requestId: () => randomUUID(),
    timing: DEFAULT_TIMING,
    localPort: TUYA_LOCAL_PORT,
    localClient: (options) =>
      new TuyaDevice({
        id: options.id,
        key: options.key,
        ip: options.ip,
        port: options.port,
        version: options.version,
        issueGetOnConnect: true,
        issueRefreshOnConnect: false,
      }),
    udpSocket: () => createSocket({ type: 'udp4', reuseAddr: true }),
    discoveryPorts,
    mqtt: nodeMqttConnect,
  };
}
