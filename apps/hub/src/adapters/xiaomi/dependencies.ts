import { randomBytes } from 'node:crypto';
import { createSocket, type Socket } from 'node:dgram';
import { MIIO_PORT } from '@smarteverything/xiaomi';

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface XiaomiTiming {
  readonly lanPollMs: number;
  readonly cloudPollMs: number;
  readonly cameraPollMs: number;
  readonly cameraFollowUpMs: number;
  readonly requestTimeoutMs: number;
  readonly requestAttempts: number;
  readonly handshakeMaxAgeMs: number;
  readonly lanFailuresBeforeCloud: number;
  readonly keepAliveMinMs: number;
  readonly keepAliveMaxMs: number;
  readonly fastPingMs: number;
  readonly fastPings: number;
  readonly duplicateWindowMs: number;
}

export interface XiaomiDependencies {
  readonly fetch: Fetch;
  readonly createSocket: () => Socket;
  readonly randomBytes: (length: number) => Uint8Array;
  readonly now: () => number;
  readonly jitter: () => number;
  readonly timing: XiaomiTiming;
  readonly specBaseUrl: string;
  readonly miioPort: number;
}

const DEFAULT_TIMING: XiaomiTiming = {
  lanPollMs: 10_000,
  cloudPollMs: 60_000,
  cameraPollMs: 15_000,
  cameraFollowUpMs: 20_000,
  requestTimeoutMs: 2_000,
  requestAttempts: 3,
  handshakeMaxAgeMs: 60_000,
  lanFailuresBeforeCloud: 3,
  keepAliveMinMs: 10_000,
  keepAliveMaxMs: 50_000,
  fastPingMs: 5_000,
  fastPings: 3,
  duplicateWindowMs: 5_000,
};

export function nodeDependencies(): XiaomiDependencies {
  return {
    fetch: (url, init) => fetch(url, init),
    createSocket: () => createSocket('udp4'),
    randomBytes: (length) => new Uint8Array(randomBytes(length)),
    now: () => Date.now(),
    jitter: () => Math.random(),
    timing: DEFAULT_TIMING,
    specBaseUrl: 'https://miot-spec.org',
    miioPort: MIIO_PORT,
  };
}
