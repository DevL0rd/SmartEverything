import type { CommandRow, Place, SignalMatcher } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Cancel, Clock } from '../clock';
import type { CommandExecutor } from '../commands/executor';
import type { WatchStateStore } from '../signals/signal-watchers';
import type { AutomationOwnedValuesRepository } from '../store/repositories/automation-owned-values';
import type { Store } from '../store/store';
import type { DecisionLog } from './driver/decisions';
import type { FinishedRun, RefusedStart } from './driver/ports';
import { DeviceSetter } from './effects/device-set';
import { TemporaryDeviceChanges } from './effects/device-temporary';
import type { DeviceEffects } from '../commands/effects';
import { HttpEffects } from './effects/http';
import type { CommandIssuer } from './issue-commands';
import { EngineV3 } from './engine-v3';
import { effectHandlers, performer } from './engine-v3-effects';
import { DeviceToggler } from './effects/device-toggle';
import { deviceExtraHandlers } from './engine-v3-effects-devices';
import type { EffectHandlers, EffectPorts } from './engine-v3-effects';
import type { EngineRepositories, EngineV3Ports } from './engine-v3-types';
import type { AutomationSecrets } from './secrets-v3';
import type { AnswerFeed } from './questions/desk';
import { WaitIndex } from './waits/wait-index';
import type { SignalFeed } from './waits/event-waits';
import { stateMemoryFromRows } from './world-v3/node-memory';
import { createWorldReads } from './world-v3/world-reads';
import type { WorldReadDeps } from './world-v3/deps';
import type { KeptData } from './world-v3/kept-data';

interface AssemblyRepositories extends EngineRepositories {
  readonly owned: Pick<AutomationOwnedValuesRepository, 'list' | 'create' | 'write'>;
}

export interface EngineAssemblyPorts {
  readonly store: Store;
  readonly repositories: AssemblyRepositories;
  readonly clock: Clock;
  readonly signals: SignalFeed;
  readonly watchState: WatchStateStore;
  readonly isPulse: (matcher: SignalMatcher) => boolean;
  readonly executor: CommandExecutor;
  readonly effects?: DeviceEffects | undefined;
  readonly issuer: CommandIssuer;
  readonly secrets: Pick<AutomationSecrets, 'resolve'>;
  readonly world: WorldReadDeps;
  readonly kept: Pick<KeptData, 'read' | 'write'>;
  readonly place: () => Place | null;
  readonly zone: () => string;
  readonly retain: (runId: string, rows: readonly CommandRow[]) => void;
  readonly decisions: DecisionLog;
  readonly recordRun: (finished: FinishedRun) => void;
  readonly refused: (start: RefusedStart) => void;
  readonly storm: (automationId: string, name: string) => void;
  readonly trace?: EngineV3Ports['trace'];
  readonly started?: EngineV3Ports['started'];
  readonly timers?: { readonly changed: () => void };
  readonly questions?: AnswerFeed;
  readonly extraEffects?: EffectHandlers;
  readonly log?: Logger;
  readonly yieldNow?: (resume: () => void) => void;
}

export interface AssembledEngine {
  readonly engine: EngineV3;
  readonly waits: WaitIndex;
}

function effectPorts(ports: EngineAssemblyPorts): EffectPorts {
  const { store, repositories, clock } = ports;
  const setter = new DeviceSetter({ store, executor: ports.executor, issuer: ports.issuer });
  return {
    setter,
    toggler: new DeviceToggler(
      { store, executor: ports.executor, issuer: ports.issuer },
      ports.world.observed,
    ),
    issuer: ports.issuer,
    temporary:
      ports.effects === undefined
        ? undefined
        : new TemporaryDeviceChanges(store, clock, ports.effects),
    http: new HttpEffects(ports.secrets, clock),
    store,
    owned: repositories.owned,
    kept: ports.kept,
    extra: {
      ...deviceExtraHandlers({ setter, store, feed: store.feed, clock }),
      ...ports.extraEffects,
    },
  };
}

export function assembleEngineV3(ports: EngineAssemblyPorts): AssembledEngine {
  const { store, repositories, clock } = ports;
  const waits = new WaitIndex({
    feed: store.feed,
    signals: ports.signals,
    clock,
    answers: ports.questions,
  });
  const handlers = effectHandlers(effectPorts(ports));
  const engine = new EngineV3({
    clock,
    place: ports.place,
    zone: ports.zone,
    repositories,
    world: {
      reads: createWorldReads(ports.world),
      persistent: ports.world.persistent,
      stateMemory: stateMemoryFromRows(store.automationNodeState, ports.timers),
    },
    effects: performer(handlers),
    retain: ports.retain,
    watch: (wait, resume): Cancel => waits.watch(wait, resume),
    watchKeys: waits.watchKeys,
    watchState: ports.watchState,
    isPulse: ports.isPulse,
    decisions: ports.decisions,
    recordRun: ports.recordRun,
    refused: ports.refused,
    storm: ports.storm,
    ...(ports.trace === undefined ? {} : { trace: ports.trace }),
    ...(ports.started === undefined ? {} : { started: ports.started }),
    ...(ports.log === undefined ? {} : { log: ports.log }),
    ...(ports.yieldNow === undefined ? {} : { yieldNow: ports.yieldNow }),
  });
  return { engine, waits };
}
