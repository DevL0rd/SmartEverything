import {
  jsonEquals,
  pluginSignalSource,
  type JsonValue,
  type PluginNode,
  type SignalInput,
} from '@smarteverything/domain';
import type { Outputs } from '@smarteverything/flow/interpret/frames';
import type { SignalBus } from '../../signals/bus';
import type { EffectFailureResult } from '../effect-failure';
import type { EffectRun } from '../effects/effect-run';
import { AutomationRunCancelledError } from '../effects/run-abort';

export type PluginUntil = NonNullable<PluginNode['until']>;

export type ResolvedUntil = Omit<PluginUntil, 'timeout'> & { readonly timeout: number };

export type Expected = Readonly<Record<string, JsonValue>>;

export type EventData = Readonly<Record<string, JsonValue>>;

export type Arrival = { readonly ok: true; readonly data: EventData } | EffectFailureResult;

export const LONGEST_TIMER_MS = 2_147_483_647;

export type UntilResult =
  { readonly ok: true; readonly until: ResolvedUntil } | EffectFailureResult;

export function resolveUntil(until: PluginUntil, params: Outputs): UntilResult {
  const { timeout, ...rest } = until;
  if (typeof timeout === 'number') return { ok: true, until: { ...rest, timeout } };
  const given = params[timeout.port];
  if (
    typeof given !== 'number' ||
    !Number.isInteger(given) ||
    given < 1 ||
    given > LONGEST_TIMER_MS
  )
    return {
      ok: false,
      class: 'Invalid',
      message: `The ${timeout.port} wait must be between 1 and ${String(LONGEST_TIMER_MS)} milliseconds.`,
      code: 'invalid_arguments',
    };
  return { ok: true, until: { ...rest, timeout: given } };
}

export interface UntilWatch {
  readonly arrive: (expected: Expected) => Promise<Arrival>;
  readonly cancel: () => void;
}

type UntilRun = Pick<EffectRun, 'runId' | 'signal'>;

function timedOut(until: ResolvedUntil): Arrival {
  return {
    ok: false,
    class: 'Timeout',
    message: `The ${until.event} event did not arrive within ${String(until.timeout)} ms.`,
    code: 'timeout',
  };
}

export type ExpectedResult =
  { readonly ok: true; readonly expected: Expected } | EffectFailureResult;

export function expectedOf(until: PluginUntil, params: Outputs, outputs: Outputs): ExpectedResult {
  const entries = Object.entries(until.match).map(([key, from]) => {
    const name = 'output' in from ? from.output : from.port;
    return [key, name, 'output' in from ? outputs[name] : params[name]] as const;
  });
  const missing = entries.filter(([, , value]) => value === undefined).map(([, name]) => name);
  if (missing.length > 0) {
    const message = `The ${until.event} event cannot be matched: ${missing.join(', ')} has no value.`;
    return { ok: false, class: 'Failed', message, code: 'missing_output' };
  }
  const expected = Object.fromEntries(
    entries.flatMap(([key, , value]) => (value === undefined ? [] : [[key, value]])),
  );
  return { ok: true, expected };
}

function matches(signal: SignalInput, expected: Expected): boolean {
  return Object.entries(expected).every(([key, value]) => {
    const actual = signal.data[key];
    return actual !== undefined && jsonEquals(actual, value);
  });
}

interface Arrivals {
  readonly seen: SignalInput[];
  readonly listeners: Set<(signal: SignalInput) => void>;
  readonly unsubscribe: () => void;
}

function collect(signals: Pick<SignalBus, 'subscribe'>, pluginId: string, event: string): Arrivals {
  const source = pluginSignalSource(pluginId);
  const seen: SignalInput[] = [];
  const listeners = new Set<(signal: SignalInput) => void>();
  const unsubscribe = signals.subscribe((signal) => {
    if (signal.source !== source || signal.kind !== event) return;
    seen.push(signal);
    for (const listener of listeners) listener(signal);
  });
  return { seen, listeners, unsubscribe };
}

function onArrival(arrivals: Arrivals, expected: Expected, done: (arrival: Arrival) => void): void {
  const earlier = arrivals.seen.find((signal) => matches(signal, expected));
  if (earlier !== undefined) {
    done({ ok: true, data: earlier.data });
    return;
  }
  arrivals.listeners.add((signal) => {
    if (matches(signal, expected)) done({ ok: true, data: signal.data });
  });
}

export function watchUntil(
  signals: Pick<SignalBus, 'subscribe'>,
  pluginId: string,
  until: ResolvedUntil,
  run: UntilRun,
): UntilWatch {
  const arrivals = collect(signals, pluginId, until.event);
  let listening = true;
  const cancel = (): void => {
    if (!listening) return;
    listening = false;
    arrivals.listeners.clear();
    run.signal.removeEventListener('abort', cancel);
    arrivals.unsubscribe();
  };
  run.signal.addEventListener('abort', cancel, { once: true });
  if (run.signal.aborted) cancel();
  const arrive = (expected: Expected): Promise<Arrival> =>
    new Promise((resolve, reject) => {
      const finish = (settle: () => void): void => {
        clearTimeout(timer);
        run.signal.removeEventListener('abort', aborted);
        cancel();
        settle();
      };
      const done = (arrival: Arrival): void => {
        finish(() => {
          resolve(arrival);
        });
      };
      const aborted = (): void => {
        finish(() => {
          reject(new AutomationRunCancelledError(run.runId));
        });
      };
      const timer = setTimeout(() => {
        done(timedOut(until));
      }, until.timeout);
      run.signal.addEventListener('abort', aborted, { once: true });
      if (run.signal.aborted) aborted();
      else onArrival(arrivals, expected, done);
    });
  return { arrive, cancel };
}
