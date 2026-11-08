import { Logger } from '@smarteverything/logging';
import {
  INITIAL_FACTS,
  STAGE_NOT_REGISTERED,
  sameFacts,
  sameStageState,
  stageState,
  type StageFacts,
  type StageState,
} from './rules';

const log = new Logger('app.house-map');

export type StageReport = Partial<Omit<StageFacts, 'appForeground'>>;

export interface AppStateSource {
  readonly currentState: string;
  readonly addEventListener: (
    type: 'change',
    listener: (state: string) => void,
  ) => { readonly remove: () => void };
}

interface StageEntry {
  readonly owner: object;
  readonly facts: StageFacts;
  readonly state: StageState;
}

export class VisibilityRegistry {
  private readonly stages = new Map<string, StageEntry>();
  private readonly stageListeners = new Map<string, Set<() => void>>();
  private readonly anyListeners = new Set<() => void>();
  private appForeground = true;

  readonly register = (id: string, report: StageReport = {}): (() => void) => {
    const facts: StageFacts = { ...INITIAL_FACTS, appForeground: this.appForeground, ...report };
    const owner = {};
    const entry: StageEntry = { owner, facts, state: stageState(STAGE_NOT_REGISTERED, facts) };
    this.stages.set(id, entry);
    log.debug('stage.registered', { id, live: entry.state.live });
    this.notify(id);
    return (): void => {
      if (this.stages.get(id)?.owner !== owner) {
        return;
      }
      this.stages.delete(id);
      log.debug('stage.unregistered', { id });
      this.notify(id);
    };
  };

  readonly report = (id: string, change: StageReport): void => {
    const entry = this.stages.get(id);
    if (entry !== undefined) {
      this.apply(id, entry, { ...entry.facts, ...change });
    }
  };

  readonly setAppForeground = (foreground: boolean): void => {
    if (this.appForeground === foreground) {
      return;
    }
    this.appForeground = foreground;
    log.debug('app.foreground', { foreground });
    for (const [id, entry] of [...this.stages]) {
      this.apply(id, entry, { ...entry.facts, appForeground: foreground });
    }
  };

  readonly bindAppState = (source: AppStateSource): (() => void) => {
    this.setAppForeground(source.currentState === 'active');
    const subscription = source.addEventListener('change', (state) => {
      this.setAppForeground(state === 'active');
    });
    return (): void => {
      subscription.remove();
    };
  };

  readonly getStage = (id: string): StageState =>
    this.stages.get(id)?.state ?? STAGE_NOT_REGISTERED;

  readonly liveStageIds = (): readonly string[] =>
    [...this.stages].filter(([, entry]) => entry.state.live).map(([id]) => id);

  readonly subscribeStage = (id: string, listener: () => void): (() => void) => {
    const listeners = this.stageListeners.get(id) ?? new Set<() => void>();
    listeners.add(listener);
    this.stageListeners.set(id, listeners);
    return (): void => {
      listeners.delete(listener);
      if (listeners.size === 0 && this.stageListeners.get(id) === listeners) {
        this.stageListeners.delete(id);
      }
    };
  };

  readonly subscribe = (listener: () => void): (() => void) => {
    this.anyListeners.add(listener);
    return (): void => {
      this.anyListeners.delete(listener);
    };
  };

  private apply(id: string, entry: StageEntry, facts: StageFacts): void {
    if (sameFacts(entry.facts, facts)) {
      return;
    }
    const state = stageState(entry.state, facts);
    this.stages.set(id, { owner: entry.owner, facts, state });
    if (sameStageState(entry.state, state)) {
      return;
    }
    log.debug('stage.changed', { id, live: state.live, mounted: state.mounted });
    this.notify(id);
  }

  private notify(id: string): void {
    for (const listener of [...(this.stageListeners.get(id) ?? [])]) {
      listener();
    }
    for (const listener of [...this.anyListeners]) {
      listener();
    }
  }
}

export function createVisibilityRegistry(): VisibilityRegistry {
  return new VisibilityRegistry();
}

export const visibilityRegistry: VisibilityRegistry = createVisibilityRegistry();
