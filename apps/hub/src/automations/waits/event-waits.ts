import type { SignalInput } from '@smarteverything/domain';
import { eventAccepts } from '@smarteverything/flow/interpret/waits';
import type { Wait } from '@smarteverything/flow/state/run-state';
import type { Cancel } from '../../clock';

export type EventWait = Extract<Wait, { kind: 'event' }>;

export interface SignalFeed {
  readonly subscribe: (listener: (signal: SignalInput) => void) => Cancel;
}

interface Entry {
  readonly wait: EventWait;
  readonly arrived: (signal: SignalInput) => void;
}

function indexKey(source: string, kind: string): string {
  return `${source}\u0000${kind}`;
}

export class EventWaits {
  private readonly index = new Map<string, Set<Entry>>();
  private unsubscribe: Cancel | undefined;

  constructor(private readonly signals: SignalFeed) {}

  get listeners(): number {
    return this.unsubscribe === undefined ? 0 : 1;
  }

  get waiting(): number {
    return [...this.index.values()].reduce((total, bucket) => total + bucket.size, 0);
  }

  watch(wait: EventWait, arrived: (signal: SignalInput) => void): Cancel {
    const entry: Entry = { wait, arrived };
    const key = indexKey(wait.matcher.source, wait.matcher.kind);
    const bucket = this.index.get(key) ?? new Set<Entry>();
    bucket.add(entry);
    this.index.set(key, bucket);
    this.unsubscribe ??= this.signals.subscribe((signal) => {
      this.observe(signal);
    });
    return () => {
      bucket.delete(entry);
      if (bucket.size === 0 && this.index.get(key) === bucket) this.index.delete(key);
      if (this.index.size === 0) {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
      }
    };
  }

  private observe(signal: SignalInput): void {
    const bucket = this.index.get(indexKey(signal.source, signal.kind));
    if (bucket === undefined) return;
    for (const entry of [...bucket]) {
      if (bucket.has(entry) && eventAccepts(entry.wait, signal)) entry.arrived(signal);
    }
  }
}
