import { addContributor } from './window-bus';
import { percent, round1, type WindowFields } from './window-math';
import { background } from '@smarteverything/logging';

const INBOUND_KEYS = [
  'framesDecoded',
  'framesDropped',
  'framesReceived',
  'totalDecodeTime',
  'freezeCount',
  'totalFreezesDuration',
  'bytesReceived',
] as const;

type InboundKey = (typeof INBOUND_KEYS)[number];
export type Inbound = Readonly<Record<InboundKey, number>>;

const ZERO: Inbound = {
  framesDecoded: 0,
  framesDropped: 0,
  framesReceived: 0,
  totalDecodeTime: 0,
  freezeCount: 0,
  totalFreezesDuration: 0,
  bytesReceived: 0,
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

export function inboundVideo(report: unknown): Inbound {
  const sum: Record<InboundKey, number> = { ...ZERO };
  if (!(report instanceof Map)) {
    return sum;
  }
  report.forEach((stat: unknown) => {
    if (!isRecord(stat) || stat['type'] !== 'inbound-rtp' || stat['kind'] !== 'video') {
      return;
    }
    INBOUND_KEYS.forEach((key) => {
      const value = stat[key];
      sum[key] += typeof value === 'number' ? value : 0;
    });
  });
  return sum;
}

export function mediaFields(delta: Inbound, peers: number, windowMs: number): WindowFields {
  const seconds = windowMs / 1000;
  return {
    camPeers: peers,
    camFps: seconds > 0 ? round1(delta.framesDecoded / seconds) : 0,
    camDropPct: percent(delta.framesDropped, delta.framesReceived),
    camDecodeMs:
      delta.framesDecoded > 0 ? round1((delta.totalDecodeTime * 1000) / delta.framesDecoded) : 0,
    camFreezes: delta.freezeCount,
    camFreezeMs: Math.round(delta.totalFreezesDuration * 1000),
    camKbps: seconds > 0 ? Math.round((delta.bytesReceived * 8) / 1000 / seconds) : 0,
  };
}

function minus(after: Inbound, before: Inbound): Inbound {
  const delta: Record<InboundKey, number> = { ...ZERO };
  INBOUND_KEYS.forEach((key) => {
    delta[key] = Math.max(0, after[key] - before[key]);
  });
  return delta;
}

function plus(a: Inbound, b: Inbound): Inbound {
  const sum: Record<InboundKey, number> = { ...ZERO };
  INBOUND_KEYS.forEach((key) => {
    sum[key] = a[key] + b[key];
  });
  return sum;
}

interface Peer {
  readonly getStats: () => Promise<unknown>;
  readonly connectionState: string;
}

function isPeer(value: unknown): value is Peer {
  return isRecord(value) && typeof value['getStats'] === 'function';
}

function trackingConstructor(peers: Set<Peer>, target: unknown): unknown {
  if (typeof target !== 'function') {
    return target;
  }
  return new Proxy(target, {
    construct(constructor, args, newTarget): object {
      const peer: unknown = Reflect.construct(constructor, args, newTarget);
      if (isPeer(peer)) {
        peers.add(peer);
      }
      return isRecord(peer) ? peer : {};
    },
  });
}

function watchGlobal(peers: Set<Peer>): () => void {
  const name = 'RTCPeerConnection';
  let raw: unknown = Reflect.get(globalThis, name);
  let current = trackingConstructor(peers, raw);
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get: () => current,
    set: (next: unknown) => {
      raw = next;
      current = trackingConstructor(peers, next);
    },
  });
  return (): void => {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: raw });
  };
}

export function startMediaProbe(): () => void {
  const peers = new Set<Peer>();
  const previous = new Map<Peer, Inbound>();
  let delta: Inbound = ZERO;
  const sample = (): void => {
    let sum = ZERO;
    const reads = [...peers].map(async (peer) => {
      if (peer.connectionState === 'closed') {
        peers.delete(peer);
        previous.delete(peer);
        return;
      }
      const now = inboundVideo(await peer.getStats());
      const before = previous.get(peer);
      if (before !== undefined) {
        sum = plus(sum, minus(now, before));
      }
      previous.set(peer, now);
    });
    background(
      Promise.allSettled(reads).then(() => {
        delta = sum;
      }),
      'settled.all_failed',
    );
  };
  const restore = watchGlobal(peers);
  const remove = addContributor('media', {
    fields: (windowMs) => {
      const fields = peers.size === 0 ? {} : mediaFields(delta, peers.size, windowMs);
      sample();
      return fields;
    },
  });
  return (): void => {
    remove();
    restore();
  };
}
