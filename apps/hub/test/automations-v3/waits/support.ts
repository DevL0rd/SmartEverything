import type { LiveChange, SignalInput, SignalMatcher } from '@smarteverything/domain';
import type { Wait } from '@smarteverything/flow/state/run-state';
import type { SignalFeed } from '../../../src/automations/waits/event-waits';
import { WaitIndex } from '../../../src/automations/waits/wait-index';
import { SimulatedClock as TestClock } from '../../../src/clock/simulated';

export const START = '2026-10-18T12:00:30.000Z';

export const DEVICE = '00000000-0000-4000-8000-000000000001';

class FakeChangeFeed {
  private readonly listeners = new Set<(change: LiveChange) => void>();
  subscriptions = 0;

  get count(): number {
    return this.listeners.size;
  }

  subscribe = (listener: (change: LiveChange) => void): (() => void) => {
    this.subscriptions += 1;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  emit(change: LiveChange): void {
    for (const listener of [...this.listeners]) listener(change);
  }
}

class FakeSignals implements SignalFeed {
  private readonly listeners = new Set<(signal: SignalInput) => void>();

  get count(): number {
    return this.listeners.size;
  }

  subscribe = (listener: (signal: SignalInput) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  emit(signal: SignalInput): void {
    for (const listener of [...this.listeners]) listener(signal);
  }
}

export class Rig {
  readonly clock = new TestClock(START);
  readonly feed = new FakeChangeFeed();
  readonly signals = new FakeSignals();
  readonly index = new WaitIndex({
    feed: this.feed,
    signals: this.signals,
    clock: this.clock,
  });
}

export function stateChange(capability: string, before: number, after: number): LiveChange {
  return {
    type: 'change',
    seq: 1,
    table: 'device_state',
    operation: 'UPDATE',
    record: { device_id: DEVICE, capability, value: after, observed_at: START },
    oldRecord: { device_id: DEVICE, capability, value: before, observed_at: START },
  };
}

export function conditionWait(deps: readonly string[], holdUntil?: number): Wait {
  return {
    kind: 'condition',
    nodePath: 'a',
    durable: false,
    deps: [...deps],
    ...(holdUntil === undefined ? {} : { holdUntil }),
  };
}

export function eventWait(matcher: SignalMatcher, parkedAt: number): Wait {
  return { kind: 'event', nodePath: 'a', durable: false, matcher, parkedAt };
}

export function signalOf(kind: string, at: string, data: Record<string, string> = {}): SignalInput {
  return {
    source: 'device',
    kind,
    subject: null,
    field: null,
    value: true,
    previous: null,
    at,
    profileId: null,
    data,
  };
}
