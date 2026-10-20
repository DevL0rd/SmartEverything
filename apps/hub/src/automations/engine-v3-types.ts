import type { CommandRow, Place, SignalMatcher } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { WatchStateStore } from '../signals/signal-watchers';
import type { AutomationFunctionsRepository } from '../store/repositories/automation-functions';
import type { AutomationRunNodesRepository } from '../store/repositories/automation-run-nodes';
import type { AutomationOwnedValuesRepository } from '../store/repositories/automation-owned-values';
import type { AutomationPlansRepository } from '../store/repositories/automation-plans';
import type { AutomationProgramsRepository } from '../store/repositories/automation-programs';
import type { AutomationRunRecordsRepository } from '../store/repositories/automation-run-records';
import type { DecisionLog } from './driver/decisions';
import type { LiveSinkParts } from './driver/live-sink';
import type { DriverPorts, FinishedRun, RefusedStart } from './driver/ports';
import type { ContextPorts } from './engine-v3-context';
import type { StartedRun } from './webhooks/gateway';
import type { Performer } from './engine-v3-effects';
import type { Subject } from './engine-v3-start';
import type { CompiledTriggers } from './triggers-v3/armers';

export interface EngineRepositories {
  readonly programs: Pick<AutomationProgramsRepository, 'list' | 'find'>;
  readonly plans: Pick<AutomationPlansRepository, 'put' | 'find' | 'has'>;
  readonly records: Pick<
    AutomationRunRecordsRepository,
    'create' | 'update' | 'waiting' | 'interruptUnfinished' | 'park' | 'resume'
  >;
  readonly nodes: Pick<AutomationRunNodesRepository, 'append' | 'settle' | 'closeOpen'>;
  readonly owned: Pick<AutomationOwnedValuesRepository, 'list' | 'create'>;
  readonly functions: Pick<AutomationFunctionsRepository, 'find' | 'latest' | 'findRevision'>;
}

export interface EngineV3Ports {
  readonly clock: Clock;
  readonly place: () => Place | null;
  readonly zone: () => string;
  readonly repositories: EngineRepositories;
  readonly world: Pick<ContextPorts, 'reads' | 'persistent' | 'stateMemory'>;
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
