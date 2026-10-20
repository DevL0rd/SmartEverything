import {
  isSampledCapability,
  type DeviceCapability,
  type JsonValue,
  type StateChange,
} from '@smarteverything/domain';
import type { Cancel, Clock } from '../clock';

export const SIGNAL_MIN_INTERVAL_MS = 2000;

export const SAMPLED_SIGNAL_MIN_INTERVAL_MS = 10_000;

interface Emitted {
  readonly value: number;
  readonly atMs: number;
}

interface Waiting {
  readonly change: StateChange;
  readonly base: Emitted;
  readonly cancel: Cancel;
}

function keyOf(change: StateChange): string {
  return `${change.deviceId}|${change.capability}`;
}

function stepOf(capability: DeviceCapability | undefined): number | null {
  return capability?.value.kind === 'number' ? capability.value.step : null;
}

function intervalOf(change: StateChange): number {
  return isSampledCapability(change.capability)
    ? SAMPLED_SIGNAL_MIN_INTERVAL_MS
    : SIGNAL_MIN_INTERVAL_MS;
}

export class ChangeThreshold {
  private readonly emitted = new Map<string, Emitted>();
  private readonly waiting = new Map<string, Waiting>();

  constructor(
    private readonly clock: Pick<Clock, 'now' | 'at'>,
    private readonly emit: (change: StateChange) => void,
  ) {}

  offer(change: StateChange, capability: DeviceCapability | undefined): void {
    if (change.previous === undefined) {
      this.rememberFirst(change.value, keyOf(change));
      return;
    }
    const step = stepOf(capability);
    const base = this.baseOf(change, change.previous);
    if (step === null || base === null || typeof change.value !== 'number') {
      this.forward(change);
      return;
    }
    if (Math.abs(change.value - base.value) < step) {
      this.cancel(keyOf(change));
      return;
    }
    const now = this.clock.now().getTime();
    const due = base.atMs + intervalOf(change);
    if (now >= due || now < base.atMs) {
      this.forward({ ...change, previous: base.value });
      return;
    }
    this.wait(change, base, due);
  }

  close(): void {
    for (const waiting of this.waiting.values()) waiting.cancel();
    this.waiting.clear();
  }

  private baseOf(change: StateChange, previous: JsonValue): Emitted | null {
    const emitted = this.emitted.get(keyOf(change));
    if (emitted !== undefined) return emitted;
    return typeof previous === 'number'
      ? { value: previous, atMs: Number.NEGATIVE_INFINITY }
      : null;
  }

  private remember(value: JsonValue, key: string): void {
    this.record(value, key, this.clock.now().getTime());
  }

  private rememberFirst(value: JsonValue, key: string): void {
    this.record(value, key, Number.NEGATIVE_INFINITY);
  }

  private record(value: JsonValue, key: string, atMs: number): void {
    if (typeof value === 'number') {
      this.emitted.set(key, { value, atMs });
    } else {
      this.emitted.delete(key);
    }
  }

  private forward(change: StateChange): void {
    const key = keyOf(change);
    this.cancel(key);
    this.remember(change.value, key);
    this.emit(change);
  }

  private cancel(key: string): void {
    this.waiting.get(key)?.cancel();
    this.waiting.delete(key);
  }

  private wait(change: StateChange, base: Emitted, due: number): void {
    const key = keyOf(change);
    const cancel =
      this.waiting.get(key)?.cancel ??
      this.clock.at(new Date(due), () => {
        this.flush(key);
      });
    this.waiting.set(key, { change, base, cancel });
  }

  private flush(key: string): void {
    const waiting = this.waiting.get(key);
    if (waiting === undefined) return;
    this.waiting.delete(key);
    this.forward({ ...waiting.change, previous: waiting.base.value });
  }
}
