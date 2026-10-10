import type { InterfaceSnapshot, NetworkSnapshot } from '@smarteverything/domain';
import { existsSync, readdirSync } from 'node:fs';
import type { KernelFiles } from './kernel-file';
import { Rescan } from './rescan';

const NET_ROOT = '/sys/class/net';

interface Counters {
  readonly received: number;
  readonly sent: number;
  readonly at: number;
}

export function physicalInterfaces(): ReadonlySet<string> {
  return new Set(readdirSync(NET_ROOT).filter((name) => existsSync(`${NET_ROOT}/${name}/device`)));
}

function countersOf(text: string, at: number): Map<string, Counters> {
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

function perSecond(now: number, before: number, seconds: number): number {
  return seconds > 0 && now >= before ? (now - before) / seconds : 0;
}

function interfaceOf(name: string, now: Counters, before: Counters | undefined): InterfaceSnapshot {
  if (before === undefined) {
    return { name, downloadRate: 0, uploadRate: 0 };
  }
  const seconds = (now.at - before.at) / 1000;
  return {
    name,
    downloadRate: perSecond(now.received, before.received, seconds),
    uploadRate: perSecond(now.sent, before.sent, seconds),
  };
}

export class NetworkCollector {
  private readonly physical = new Rescan(physicalInterfaces);
  private before = new Map<string, Counters>();

  constructor(private readonly files: KernelFiles) {}

  read(at: number): NetworkSnapshot {
    const now = countersOf(this.files.read('/proc/net/dev'), at);
    const before = this.before;
    this.before = now;
    const physical = this.physical.current(at);
    const interfaces = [...now]
      .filter(([name]) => physical.has(name))
      .map(([name, counters]) => interfaceOf(name, counters, before.get(name)));
    return {
      downloadRate: interfaces.reduce((sum, item) => sum + item.downloadRate, 0),
      uploadRate: interfaces.reduce((sum, item) => sum + item.uploadRate, 0),
      interfaces,
    };
  }
}
