import {
  SIGNAL_INPUT,
  SIGNAL_SOURCES,
  jsonEquals,
  kindSpecOf,
  signalKey,
  signalRegistered,
  type SignalInput,
  type SignalSourceSpec,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';

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
}

export class SignalBus implements SignalEmitter {
  private readonly listeners = new Set<SignalListener>();
  private readonly newest = new Map<string, SignalInput>();
  private readonly sources: readonly SignalSourceSpec[];
  private readonly registered = new Set<SignalSourceSpec>();

  constructor(private readonly options: SignalBusOptions) {
    this.sources = options.sources ?? SIGNAL_SOURCES;
  }

  readonly emit = (input: SignalInput): void => {
    const parsed = SIGNAL_INPUT.safeParse(input);
    if (!parsed.success) {
      this.options.log.error('signals.invalid', parsed.error, {
        source: input.source,
        kind: input.kind,
      });
      return;
    }
    const signal = this.withPrevious(parsed.data);
    if (signal === null) {
      return;
    }
    if (!signalRegistered([...this.sources, ...this.registered], signal)) {
      this.options.log.error('signals.unregistered', new Error('Signal kind not registered'), {
        source: signal.source,
        kind: signal.kind,
        field: signal.field,
      });
      return;
    }
    const key = signalKey(signal);
    this.newest.delete(key);
    this.newest.set(key, signal);
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

  private withPrevious(signal: SignalInput): SignalInput | null {
    const newest = this.newest.get(signalKey(signal));
    if (newest === undefined || kindSpecOf(this.sources, signal)?.pulse !== false) {
      return signal;
    }
    if (jsonEquals(newest.value, signal.value)) {
      return null;
    }
    return signal.previous === null ? { ...signal, previous: newest.value } : signal;
  }

  latest(filter: SignalFilter): SignalInput[] {
    return [...this.newest.values()].filter((signal) => matchesFilter(signal, filter)).reverse();
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
