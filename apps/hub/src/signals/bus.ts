import {
  DEFAULT_TRIGGER_SETTINGS,
  SIGNAL_INPUT,
  SIGNAL_SOURCES,
  jsonEquals,
  kindSpecOf,
  signalKey,
  signalRegistered,
  triggerKindEnabled,
  type SignalInput,
  type SignalKindSpec,
  type SignalSourceSpec,
  type StormReason,
  type TriggerSettings,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { systemClock, type Clock } from '../clock';
import { RateGuard, type GuardVerdict } from './rate-guard';
import { StateCoalescer } from './state-coalescer';

export type SignalListener = (signal: SignalInput) => void;

interface SignalEmitter {
  readonly emit: (signal: SignalInput) => void;
}

export interface SignalFilter {
  readonly source: string;
  readonly kind?: string | undefined;
  readonly subject?: string | undefined;
  readonly field?: string | undefined;
}

function matchesFilter(signal: SignalInput, filter: SignalFilter): boolean {
  return (
    signal.source === filter.source &&
    (filter.kind === undefined || signal.kind === filter.kind) &&
    (filter.subject === undefined || signal.subject === filter.subject) &&
    (filter.field === undefined || signal.field === filter.field)
  );
}

export interface SignalBusOptions {
  readonly sources?: readonly SignalSourceSpec[];
  readonly log: Logger;
  readonly now?: () => Date;
  readonly at?: Clock['at'];
  readonly triggers?: () => TriggerSettings;
}

const STORM_REASON_OF: Readonly<Record<GuardVerdict, StormReason | null>> = {
  pass: null,
  duplicate: null,
  uncapped: null,
  cap: 'cap',
  global: 'global',
};

export class SignalBus implements SignalEmitter {
  private readonly listeners = new Set<SignalListener>();
  private readonly newest = new Map<string, SignalInput>();
  private readonly sources: readonly SignalSourceSpec[];
  private readonly registered = new Set<SignalSourceSpec>();
  private readonly guard: RateGuard;
  private readonly coalescer: StateCoalescer;
  private readonly now: () => Date;

  constructor(private readonly options: SignalBusOptions) {
    this.sources = options.sources ?? SIGNAL_SOURCES;
    this.now = options.now ?? ((): Date => new Date());
    this.guard = new RateGuard({
      now: (): number => this.now().getTime(),
      log: options.log,
    });
    this.coalescer = new StateCoalescer(options.at ?? systemClock.at, this.emit);
  }

  readonly emit = (input: SignalInput): void => {
    const spec = this.specOf(input);
    if (spec !== undefined && !this.admitted(input, spec)) {
      return;
    }
    const parsed = SIGNAL_INPUT.safeParse(input);
    if (!parsed.success) {
      this.options.log.error('signals.invalid', parsed.error, {
        source: input.source,
        kind: input.kind,
      });
      return;
    }
    const signal = this.withPrevious(parsed.data, spec);
    if (!signalRegistered([...this.sources, ...this.registered], signal)) {
      this.options.log.error('signals.unregistered', new Error('Signal kind not registered'), {
        source: signal.source,
        kind: signal.kind,
        field: signal.field,
      });
      return;
    }
    if (spec?.transient !== true) {
      const key = signalKey(signal);
      this.newest.delete(key);
      this.newest.set(key, signal);
    }
    for (const listener of this.listeners) {
      try {
        listener(signal);
      } catch (cause) {
        this.options.log.error('signals.listener_failed', cause, {
          source: signal.source,
          kind: signal.kind,
        });
      }
    }
  };

  specOf(signal: Pick<SignalInput, 'source' | 'kind'>): SignalKindSpec | undefined {
    return kindSpecOf(this.sources, signal) ?? kindSpecOf([...this.registered], signal);
  }

  private admitted(signal: SignalInput, spec: SignalKindSpec): boolean {
    const triggers = this.options.triggers?.() ?? DEFAULT_TRIGGER_SETTINGS;
    if (!triggerKindEnabled(triggers, signal.source, spec)) {
      return false;
    }
    const key = signalKey(signal);
    if (!spec.pulse && this.repeats(signal)) {
      this.coalescer.drop(key);
      return false;
    }
    const verdict = this.guard.admit(signal, spec);
    if (verdict === 'pass') {
      this.coalescer.drop(key);
    }
    if (verdict === 'cap' && !spec.pulse) {
      this.coalescer.hold(key, signal, this.guard.refillAt(signal));
    }
    if (verdict !== 'pass') {
      this.announceStorm(signal, verdict);
    }
    return verdict === 'pass';
  }

  private repeats(signal: SignalInput): boolean {
    const newest = this.newest.get(signalKey(signal));
    return newest !== undefined && jsonEquals(newest.value, signal.value);
  }

  private announceStorm(signal: SignalInput, verdict: GuardVerdict): void {
    const reason = STORM_REASON_OF[verdict];
    if (reason === null || !this.guard.announceDue(signal.source)) {
      return;
    }
    this.emit({
      source: 'hub',
      kind: 'storm',
      subject: null,
      field: null,
      value: true,
      previous: null,
      at: this.now().toISOString(),
      profileId: null,
      data: { source: signal.source, kind: signal.kind, reason },
    });
  }

  private withPrevious(signal: SignalInput, spec: SignalKindSpec | undefined): SignalInput {
    const newest = this.newest.get(signalKey(signal));
    if (newest === undefined || spec?.pulse !== false || signal.previous !== null) {
      return signal;
    }
    return { ...signal, previous: newest.value };
  }

  latest(filter: SignalFilter): SignalInput[] {
    return [...this.newest.values()].filter((signal) => matchesFilter(signal, filter)).reverse();
  }

  close(): void {
    this.coalescer.close();
  }

  register(spec: SignalSourceSpec): () => void {
    this.registered.add(spec);
    return () => {
      this.registered.delete(spec);
    };
  }

  subscribe(listener: SignalListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
