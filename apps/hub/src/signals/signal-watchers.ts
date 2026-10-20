import {
  signalMatchesMatcher,
  type SignalInput,
  type SignalMatcher,
} from '@smarteverything/domain';
import type { Clock } from '../clock';
import type { WatchKey, WatchState, WatchTrigger } from '../store/repositories/signal-watch-state';
import { SignalWatch } from './signal-watch';
import type { WatchPersistence } from './watch-memory';

export interface WatchStateStore {
  readonly load: (key: WatchKey) => WatchState | null;
  readonly save: (key: WatchKey, state: WatchState) => void;
  readonly retain: (triggers: readonly WatchTrigger[]) => void;
}

export interface WatchedTrigger {
  readonly triggerId: string;
  readonly matcher: SignalMatcher;
  readonly pulse: boolean;
}

export interface WatchedAutomation {
  readonly automationId: string;
  readonly triggers: readonly WatchedTrigger[];
}

export interface SignalWatchersOptions {
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly timeZone: () => string;
  readonly state: WatchStateStore;
  readonly fire: (automationId: string, signal: SignalInput, triggerId: string) => void;
}

interface Watched extends WatchedTrigger {
  readonly automationId: string;
  readonly watches: Map<string, SignalWatch>;
}

function indexKey(source: string, kind: string): string {
  return `${source}\u0000${kind}`;
}

function partitionOf(watched: WatchedTrigger, signal: SignalInput): string {
  return watched.pulse || watched.matcher.silentSeconds !== undefined
    ? ''
    : `${signal.subject ?? ''}|${signal.field ?? ''}`;
}

function remembers({ matcher }: WatchedTrigger): boolean {
  return (
    matcher.silentSeconds !== undefined ||
    matcher.first !== undefined ||
    matcher.rearm !== undefined
  );
}

export class SignalWatchers {
  private watched: Watched[] = [];
  private index = new Map<string, Watched[]>();

  constructor(private readonly options: SignalWatchersOptions) {}

  load(automations: readonly WatchedAutomation[]): void {
    this.stop();
    this.watched = automations.flatMap((automation) => this.entriesOf(automation));
    this.reindex();
    this.prune();
    this.armSilent(this.watched);
  }

  replace(automationId: string, automation: WatchedAutomation | null): void {
    const kept: Watched[] = [];
    for (const entry of this.watched) {
      if (entry.automationId !== automationId) kept.push(entry);
      else for (const watch of entry.watches.values()) watch.stop();
    }
    const added = automation === null ? [] : this.entriesOf(automation);
    this.watched = [...kept, ...added];
    this.reindex();
    this.prune();
    this.armSilent(added);
  }

  prune(): void {
    this.options.state.retain(this.watched.filter(remembers));
  }

  private entriesOf({ automationId, triggers }: WatchedAutomation): Watched[] {
    return triggers.map((trigger) => ({
      ...trigger,
      automationId,
      watches: new Map<string, SignalWatch>(),
    }));
  }

  private reindex(): void {
    this.index = new Map();
    for (const entry of this.watched) {
      const key = indexKey(entry.matcher.source, entry.matcher.kind);
      const bucket = this.index.get(key);
      if (bucket === undefined) this.index.set(key, [entry]);
      else bucket.push(entry);
    }
  }

  private armSilent(entries: readonly Watched[]): void {
    for (const entry of entries) {
      if (entry.matcher.silentSeconds !== undefined) this.watchFor(entry, '').arm();
    }
  }

  observe(signal: SignalInput): void {
    for (const entry of this.index.get(indexKey(signal.source, signal.kind)) ?? []) {
      if (signalMatchesMatcher(entry.matcher, signal)) {
        this.watchFor(entry, partitionOf(entry, signal)).observe(signal);
      }
    }
  }

  stop(): void {
    for (const entry of this.watched) {
      for (const watch of entry.watches.values()) {
        watch.stop();
      }
    }
    this.watched = [];
    this.index = new Map();
  }

  private watchFor(entry: Watched, key: string): SignalWatch {
    const existing = entry.watches.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const watch = new SignalWatch({
      matcher: entry.matcher,
      pulse: entry.pulse,
      clock: this.options.clock,
      timeZone: this.options.timeZone,
      persistence: remembers(entry) ? this.persistenceOf(entry, key) : null,
      fire: (fired): void => {
        this.options.fire(entry.automationId, fired, entry.triggerId);
      },
    });
    entry.watches.set(key, watch);
    return watch;
  }

  private persistenceOf(entry: Watched, partition: string): WatchPersistence {
    const key: WatchKey = {
      automationId: entry.automationId,
      triggerId: entry.triggerId,
      partition,
    };
    const { state } = this.options;
    return {
      load: (): WatchState | null => state.load(key),
      save: (next): void => {
        state.save(key, next);
      },
    };
  }
}
