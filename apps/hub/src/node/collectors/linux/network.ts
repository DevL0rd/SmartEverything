import {
  perSecond,
  type InterfaceKind,
  type InterfaceSnapshot,
  type NetworkPart,
} from '@smarteverything/domain';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { addressesOf } from '../../../network/lan';
import { percent, rate } from '../rounding';
import { PerTick, type Tick } from '../tick';
import type { KernelFiles } from './kernel-file';
import { Rescan } from './rescan';

const NET_ROOT = '/sys/class/net';
const ETHERNET_TYPE = 1;
const WIRELESS_MAX_QUALITY = 70;

interface Counters {
  readonly received: number;
  readonly sent: number;
  readonly at: number;
}

interface Adapter {
  readonly name: string;
  readonly kind: InterfaceKind;
  readonly speedMbps: number | null;
  readonly addresses: readonly string[];
}

type Rates = Pick<InterfaceSnapshot, 'downloadRate' | 'uploadRate'>;

export function physicalInterfaces(): ReadonlySet<string> {
  return new Set(readdirSync(NET_ROOT).filter((name) => existsSync(`${NET_ROOT}/${name}/device`)));
}

export function kindOf(name: string): InterfaceKind {
  const root = `${NET_ROOT}/${name}`;
  if (existsSync(`${root}/wireless`) || existsSync(`${root}/phy80211`)) {
    return 'wifi';
  }
  if (existsSync(`${root}/bridge`)) {
    return 'bridge';
  }
  if (existsSync(`${root}/tun_flags`) || name.startsWith('wg')) {
    return 'vpn';
  }
  const type = existsSync(`${root}/type`) ? Number(readFileSync(`${root}/type`, 'utf8')) : 0;
  return type === ETHERNET_TYPE ? 'ethernet' : 'other';
}

function speedOf(name: string): number | null {
  try {
    const speed = Number(readFileSync(`${NET_ROOT}/${name}/speed`, 'utf8'));
    return speed > 0 ? speed : null;
  } catch (cause) {
    if (cause instanceof Error) {
      return null;
    }
    throw cause;
  }
}

function adaptersOf(): Adapter[] {
  const addresses = networkInterfaces();
  return [...physicalInterfaces()].map((name) => ({
    name,
    kind: kindOf(name),
    speedMbps: speedOf(name),
    addresses: addressesOf(addresses, name),
  }));
}

export function countersOf(text: string, at: number): Map<string, Counters> {
  const counters = new Map<string, Counters>();
  for (const line of text.split('\n')) {
    const match = /^\s*([^:\s]+):\s*(.*)$/.exec(line);
    const name = match?.[1];
    const fields = match?.[2]?.trim().split(/\s+/).map(Number);
    if (name !== undefined && fields !== undefined && fields.length >= 9) {
      counters.set(name, { received: fields[0] ?? 0, sent: fields[8] ?? 0, at });
    }
  }
  return counters;
}

export function signalsOf(text: string): Map<string, number> {
  const signals = new Map<string, number>();
  for (const line of text.split('\n').slice(2)) {
    const match = /^\s*([^:\s]+):\s+\S+\s+(\d+)/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      signals.set(match[1], percent((Number(match[2]) / WIRELESS_MAX_QUALITY) * 100));
    }
  }
  return signals;
}

function ratesOf(now: Counters, before: Counters | undefined): Rates {
  if (before === undefined) {
    return { downloadRate: 0, uploadRate: 0 };
  }
  const seconds = (now.at - before.at) / 1000;
  return {
    downloadRate: rate(perSecond(now.received, before.received, seconds)),
    uploadRate: rate(perSecond(now.sent, before.sent, seconds)),
  };
}

function stateOf(text: string): InterfaceSnapshot['state'] {
  const state = text.trim();
  return state === 'up' || state === 'down' ? state : 'unknown';
}

export class NetworkCollector {
  private readonly adapters = new Rescan(adaptersOf);
  private readonly rates = new PerTick<Map<string, Rates>>();
  private before = new Map<string, Counters>();

  constructor(private readonly files: KernelFiles) {}

  totals(tick: Tick): Rates {
    const rates = this.ratesOf(tick);
    const physical = this.adapters.current(tick.at);
    let download = 0;
    let upload = 0;
    for (const adapter of physical) {
      download += rates.get(adapter.name)?.downloadRate ?? 0;
      upload += rates.get(adapter.name)?.uploadRate ?? 0;
    }
    return { downloadRate: rate(download), uploadRate: rate(upload) };
  }

  part(tick: Tick): NetworkPart {
    const rates = this.ratesOf(tick);
    const adapters = this.adapters.current(tick.at);
    const signals = adapters.some((adapter) => adapter.kind === 'wifi')
      ? signalsOf(this.files.read('/proc/net/wireless'))
      : new Map<string, number>();
    const interfaces = adapters.map((adapter): InterfaceSnapshot => {
      const counted = rates.get(adapter.name) ?? { downloadRate: 0, uploadRate: 0 };
      return {
        name: adapter.name,
        kind: adapter.kind,
        state: stateOf(this.files.read(`${NET_ROOT}/${adapter.name}/operstate`)),
        speedMbps: adapter.speedMbps,
        signalPercent: signals.get(adapter.name) ?? null,
        addresses: [...adapter.addresses],
        ...counted,
      };
    });
    return { ...this.totals(tick), interfaces };
  }

  private ratesOf(tick: Tick): Map<string, Rates> {
    return this.rates.get(tick, () => {
      const now = countersOf(this.files.read('/proc/net/dev'), tick.at);
      const before = this.before;
      this.before = now;
      return new Map(
        [...now].map(([name, counters]) => [name, ratesOf(counters, before.get(name))]),
      );
    });
  }
}
