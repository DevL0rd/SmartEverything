import {
  SIGNAL_LIMITS,
  signalMatchesV2,
  triggerTestHolds,
  windowValue,
  type JsonValue,
  type SignalInput,
  type SignalTriggerV2,
  type WindowSample,
} from '@smarteverything/domain';
import type { Cancel, Clock } from '../clock';

const SECOND_MS = 1000;

export interface SignalWatchOptions {
  readonly trigger: SignalTriggerV2;
  readonly pulse: boolean;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly fire: (signal: SignalInput) => void;
}

export class SignalWatch {
  private samples: WindowSample[] = [];
  private latest: SignalInput | null = null;
  private previousAggregate: JsonValue | null = null;
  private holding = false;
  private lastFiredMs = Number.NEGATIVE_INFINITY;
  private holdTimer: Cancel | null = null;
  private settleTimer: Cancel | null = null;
  private expiryTimer: Cancel | null = null;

  constructor(private readonly options: SignalWatchOptions) {}

  observe(signal: SignalInput): void {
    const { trigger } = this.options;
    if (!signalMatchesV2(trigger, signal)) {
      return;
    }
    this.seedEdge(signal);
    this.latest = signal;
    if (trigger.window !== undefined) {
      this.samples.push({ atMs: this.options.clock.now().getTime(), value: signal.value });
      this.samples = this.samples.slice(-SIGNAL_LIMITS.windowSamples);
    }
    const debounce = trigger.debounceSeconds ?? 0;
    if (debounce === 0) {
      this.evaluate(true);
      return;
    }
    this.settleTimer?.();
    this.settleTimer = this.after(debounce, () => {
      this.settleTimer = null;
      this.evaluate(true);
    });
  }

  stop(): void {
    for (const cancel of [this.holdTimer, this.settleTimer, this.expiryTimer]) {
      cancel?.();
    }
    this.holdTimer = null;
    this.settleTimer = null;
    this.expiryTimer = null;
  }

  private get pulse(): boolean {
    const { trigger } = this.options;
    return (this.options.pulse && trigger.window === undefined) || trigger.test?.is === 'changed';
  }

  private seedEdge(signal: SignalInput): void {
    const { trigger } = this.options;
    if (this.latest !== null || this.pulse || trigger.window !== undefined) return;
    this.holding =
      trigger.test !== undefined &&
      signal.previous !== null &&
      triggerTestHolds(trigger.test, signal.previous, undefined);
  }

  private evaluate(fresh: boolean): void {
    const signal = this.latest;
    if (signal === null) {
      return;
    }
    this.prune();
    const holds = this.holds(signal);
    this.armExpiry();
    if (this.pulse) {
      if (holds && fresh) {
        this.fire(signal);
      }
      return;
    }
    this.edge(holds, signal);
  }

  private holds(signal: SignalInput): boolean {
    const { test, window } = this.options.trigger;
    if (window === undefined) {
      return triggerTestHolds(test, signal.value, signal.previous ?? undefined);
    }
    const value = windowValue(window.of, this.samples);
    const previous = this.previousAggregate;
    this.previousAggregate = value;
    if (value === null) {
      return false;
    }
    return triggerTestHolds(test, value, previous ?? undefined);
  }

  private edge(holds: boolean, signal: SignalInput): void {
    if (!holds) {
      this.holding = false;
      this.holdTimer?.();
      this.holdTimer = null;
      return;
    }
    if (this.holding) {
      return;
    }
    this.holding = true;
    const hold = this.options.trigger.holdSeconds ?? 0;
    if (hold === 0) {
      this.fire(signal);
      return;
    }
    this.holdTimer = this.after(hold, () => {
      this.holdTimer = null;
      this.fire(this.latest ?? signal);
    });
  }

  private fire(signal: SignalInput): void {
    const now = this.options.clock.now().getTime();
    const cooldown = this.options.trigger.cooldownSeconds ?? 0;
    if (now - this.lastFiredMs < cooldown * SECOND_MS) {
      return;
    }
    this.lastFiredMs = now;
    this.options.fire(signal);
  }

  private prune(): void {
    const { window } = this.options.trigger;
    if (window === undefined) {
      return;
    }
    const oldest = this.options.clock.now().getTime() - window.seconds * SECOND_MS;
    this.samples = this.samples.filter((sample) => sample.atMs > oldest);
  }

  private armExpiry(): void {
    this.expiryTimer?.();
    this.expiryTimer = null;
    const { window } = this.options.trigger;
    const first = this.samples[0];
    if (window === undefined || first === undefined) {
      return;
    }
    this.expiryTimer = this.options.clock.at(
      new Date(first.atMs + window.seconds * SECOND_MS + 1),
      () => {
        this.expiryTimer = null;
        this.evaluate(false);
      },
    );
  }

  private after(seconds: number, action: () => void): Cancel {
    return this.options.clock.at(
      new Date(this.options.clock.now().getTime() + seconds * SECOND_MS),
      action,
    );
  }
}
