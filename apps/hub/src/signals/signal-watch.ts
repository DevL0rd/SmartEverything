import {
  SIGNAL_LIMITS,
  directionalTest,
  firstPeriodKey,
  rearmReached,
  signalMatchesMatcher,
  triggerTestHolds,
  windowValue,
  type JsonValue,
  type SignalInput,
  type SignalMatcher,
  type WindowSample,
} from '@smarteverything/domain';
import type { Cancel, Clock } from '../clock';
import { WatchMemory, type WatchPersistence } from './watch-memory';

const SECOND_MS = 1000;

export interface SignalWatchOptions {
  readonly matcher: SignalMatcher;
  readonly pulse: boolean;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly timeZone: () => string;
  readonly persistence: WatchPersistence | null;
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
  private silenceTimer: Cancel | null = null;
  private compared: JsonValue | null = null;
  private readonly memory: WatchMemory;

  constructor(private readonly options: SignalWatchOptions) {
    this.memory = new WatchMemory(options.persistence, options.clock);
  }

  arm(): void {
    const { silentSeconds } = this.options.matcher;
    if (silentSeconds === undefined) return;
    const now = this.options.clock.now().getTime();
    const heard = this.memory.lastSeenMs ?? now;
    if (this.memory.lastSeenMs === null) this.memory.seen(now);
    if (!this.memory.latched) this.waitForSilence(heard + silentSeconds * SECOND_MS);
  }

  observe(signal: SignalInput): void {
    const { matcher: trigger } = this.options;
    if (!signalMatchesMatcher(trigger, signal)) {
      return;
    }
    if (trigger.silentSeconds !== undefined) {
      this.hear(trigger.silentSeconds);
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
    for (const cancel of [this.holdTimer, this.settleTimer, this.expiryTimer, this.silenceTimer]) {
      cancel?.();
    }
    this.holdTimer = null;
    this.settleTimer = null;
    this.expiryTimer = null;
    this.silenceTimer = null;
    this.memory.flush();
  }

  private hear(silentSeconds: number): void {
    this.memory.seen(this.options.clock.now().getTime());
    if (this.memory.latched) this.memory.change({ latched: false });
    this.waitForSilence(this.options.clock.now().getTime() + silentSeconds * SECOND_MS);
  }

  private waitForSilence(deadlineMs: number): void {
    this.silenceTimer?.();
    this.silenceTimer = this.options.clock.at(new Date(deadlineMs), () => {
      this.silenceTimer = null;
      this.memory.change({ latched: true });
      this.fire(this.silence());
    });
  }

  private silence(): SignalInput {
    const { matcher: trigger, clock } = this.options;
    return {
      source: trigger.source,
      kind: trigger.kind,
      subject: trigger.subject ?? null,
      field: trigger.field ?? null,
      value: null,
      previous: null,
      at: clock.now().toISOString(),
      profileId: null,
      data: trigger.match ?? {},
    };
  }

  private get pulse(): boolean {
    const { matcher: trigger } = this.options;
    return (this.options.pulse && trigger.window === undefined) || trigger.test?.is === 'changed';
  }

  private seedEdge(signal: SignalInput): void {
    const { matcher: trigger } = this.options;
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
    if (!holds) this.releaseLatch();
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
    const { test, window } = this.options.matcher;
    if (window === undefined) {
      this.compared = signal.value;
      return triggerTestHolds(test, signal.value, signal.previous ?? undefined);
    }
    const value = windowValue(window.of, this.samples);
    const previous = this.previousAggregate;
    this.previousAggregate = value;
    this.compared = value;
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
    const hold = this.options.matcher.holdSeconds ?? 0;
    if (hold === 0) {
      this.fire(signal);
      return;
    }
    this.holdTimer = this.after(hold, () => {
      this.holdTimer = null;
      this.fire(this.latest ?? signal);
    });
  }

  private releaseLatch(): void {
    const { rearm, test } = this.options.matcher;
    const directional = directionalTest(test);
    const value = this.compared;
    if (rearm === undefined || directional === null || typeof value !== 'number') return;
    if (this.memory.latched && rearmReached(directional, rearm, value)) {
      this.memory.change({ latched: false });
    }
  }

  private fire(signal: SignalInput): void {
    const { matcher: trigger, clock } = this.options;
    const now = clock.now().getTime();
    const cooldown = trigger.cooldownSeconds ?? 0;
    if (now - this.lastFiredMs < cooldown * SECOND_MS) {
      return;
    }
    if (trigger.rearm !== undefined && this.memory.latched) {
      return;
    }
    const period = this.periodAt(now);
    if (period !== null && period === this.memory.period) {
      return;
    }
    this.lastFiredMs = now;
    this.remember(period);
    this.options.fire(signal);
  }

  private periodAt(nowMs: number): string | null {
    const { first } = this.options.matcher;
    return first === undefined
      ? null
      : firstPeriodKey(first, new Date(nowMs), this.options.timeZone());
  }

  private remember(period: string | null): void {
    if (period === null && this.options.matcher.rearm === undefined) return;
    this.memory.change({
      ...(period === null ? {} : { period }),
      ...(this.options.matcher.rearm === undefined ? {} : { latched: true }),
    });
  }

  private prune(): void {
    const { window } = this.options.matcher;
    if (window === undefined) {
      return;
    }
    const oldest = this.options.clock.now().getTime() - window.seconds * SECOND_MS;
    this.samples = this.samples.filter((sample) => sample.atMs > oldest);
  }

  private armExpiry(): void {
    this.expiryTimer?.();
    this.expiryTimer = null;
    const { window } = this.options.matcher;
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
