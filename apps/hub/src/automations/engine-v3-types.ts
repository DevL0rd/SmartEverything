import type { CommandRow, Place, SignalMatcher } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { WatchStateStore } from '../signals/signal-watchers';
import type { DecisionLog } from './driver/decisions';
import type { LiveSinkParts } from './driver/live-sink';
import type { DriverPorts, FinishedRun, RefusedStart } from './driver/ports';
import type { ContextPorts } from './engine-v3-context';
import type { KindCatalog } from './plugin-kinds/catalog';
import type { StartedRun } from './webhooks/gateway';
import type { Performer } from './engine-v3-effects';
import type { Subject } from './engine-v3-start';
import type { CompiledTriggers } from './triggers-v3/armers';
import type { RunLedger } from './run-ledger';
import type { AutomationMemory } from './automation-memory';
import type { EngineStore } from './engine-store';

export interface EngineRepositories {
  readonly store: EngineStore;
  readonly runs: RunLedger;
}

export interface EngineV3Ports {
  readonly clock: Clock;
  readonly place: () => Place | null;
  readonly zone: () => string;
  readonly repositories: EngineRepositories;
  readonly memory: AutomationMemory;
  readonly world: Pick<ContextPorts, 'reads' | 'persistent' | 'stateMemory' | 'host'>;
  readonly ready: () => Promise<void>;
  readonly kinds: KindCatalog;
  readonly effects: Performer;
  readonly retain: (runId: string, rows: readonly CommandRow[]) => void;
  readonly watch: DriverPorts['watch'];
  readonly watchKeys: (keys: readonly string[], changed: () => void) => Cancel;
  readonly watchState: WatchStateStore;
  readonly isPulse: (matcher: SignalMatcher) => boolean;
  readonly decisions: DecisionLog;
  readonly recordRun: (finished: FinishedRun) => void;
  readonly refused: (start: RefusedStart) => void;
  readonly storm: (automationId: string, name: string) => void;
  readonly trace?: Pick<LiveSinkParts, 'watched' | 'publish'>;
  readonly started?: (start: StartedRun) => void;
  readonly log?: Logger;
  readonly yieldNow?: (resume: () => void) => void;
}

export interface Loaded {
  readonly subject: Subject;
  readonly signature: string;
  readonly compiled: CompiledTriggers;
  readonly disarm: Cancel;
}

export interface SyncReport {
  readonly loaded: number;
  readonly unchanged: number;
  readonly removed: number;
  readonly refused: number;
}
