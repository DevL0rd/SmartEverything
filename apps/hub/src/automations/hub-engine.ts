import { randomUUID } from 'node:crypto';
import { atHomePlace, kindSpecOf, type Place } from '@smarteverything/domain';
import { background, failureLine, type Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import type { CommandExecutor } from '../commands/executor';
import type { DeviceEffects } from '../commands/effects';
import type { HubDatabase } from '../database/port';
import type { SecretStore } from '../secrets/store';
import type { SignalBus } from '../signals/bus';
import { installedSignalSources } from '../signals/sources/installed';
import type { EventRouter } from '../state/event-router';
import type { StateWriter } from '../state/state-writer';
import type { Store } from '../store/store';
import { AutomationAiSlot } from './automation-ai';
import { AutomationComputersSlot } from './automation-computers';
import { AutomationIntegrationSlot } from './automation-integration';
import { AutomationTraceSlot } from './automation-trace';
import { WebhookReplies } from './effects/webhook-replies';
import { QuestionDesk } from './questions/desk';
import { hostTimerRows, TimerWakes } from './timers/timer-wakes';
import { WebhookGateway } from './webhooks/gateway';
import type { FinishedRun } from './driver/ports';
import { assembleEngineV3 } from './engine-v3-assembly';
import { hostRunLedger } from './run-ledger';
import { AutomationMemory } from './automation-memory';
import { secretUsers } from './secret-users';
import { hostEngineStore, type EngineStore } from './engine-store';
import type { EngineAssemblyPorts } from './engine-v3-assembly';
import { AutomationRunCancelledError } from './effects/run-abort';
import type { EngineV3 } from './engine-v3';
import type { EffectHandlers } from './engine-v3-effects';
import { hubEffectHandlers } from './hub-effects';
import { integrationEffects } from './integration-effects';
import { coreNodeEffects } from './effects/core-node-effects';
import type { DriverNodes } from './plugin-kinds/driver-nodes';
import { pluginNodeEffects } from './plugin-kinds/perform';
import { DeviceSetter } from './effects/device-set';
import { AutomationDriveSlot } from './effects/drive-nodes';
import { AutomationImagesSlot } from './effects/image-nodes';
import { CommandIssuer } from './issue-commands';
import { automationSecrets } from './secrets-v3';
import type { AutomationSecrets } from './secrets-v3';
import { rehearsals } from './rehearsals';
import type { Rehearsals } from '../server/handlers/automation-runs';
import type { WorldReadDeps } from './world-v3/deps';
import {
  createKindCatalog,
  type KindCatalog,
  type PluginKindCatalog,
} from './plugin-kinds/catalog';
import { HostKindLedger } from './plugin-kinds/host-ledger';
import { persistPluginKinds } from './plugin-kinds/store';
import { nodeMemoryFromState } from './world-v3/node-memory';
import type { PresenceSource } from './world-v3/presence';
import { seededRandom } from './world-v3/random';
import { persistentFromOwned, withKeptData } from './world-v3/variables';
import { KeptData } from './world-v3/kept-data';
import { WorldMirror, type WorldSource } from './world-v3/world-mirror';
import { HostWatchState } from './watch-state';
import { hostDecisionLog } from './driver/decisions';

export interface HubEngineParts {
  readonly store: Store;
  readonly database: HubDatabase;
  readonly secrets: SecretStore;
  readonly clock: Clock;
  readonly log: Logger;
  readonly state: Pick<StateWriter, 'valueOf'>;
  readonly events: Pick<EventRouter, 'record'>;
  readonly signals: Pick<SignalBus, 'subscribe' | 'latest' | 'emit'>;
  readonly executor: CommandExecutor;
  readonly effects: DeviceEffects;
}

export interface HubEngine {
  readonly engine: EngineV3;
  readonly secrets: AutomationSecrets;
  readonly ai: AutomationAiSlot;
  readonly computers: AutomationComputersSlot;
  readonly integration: AutomationIntegrationSlot;
  readonly drive: AutomationDriveSlot;
  readonly trace: AutomationTraceSlot;
  readonly rehearsals: Rehearsals;
  readonly webhooks: WebhookGateway;
  readonly timers: TimerWakes;
  readonly questions: QuestionDesk;
  readonly kinds: PluginKindCatalog;
  readonly world: WorldMirror;
}

function presenceOf(world: WorldSource): PresenceSource {
  return {
    people: () =>
      world.profiles.list().map((profile) => {
        const context = world.phoneContexts.latestOf(profile.id);
        return {
          id: profile.id,
          name: profile.name,
          guest: false,
          home: atHomePlace(context?.place ?? null),
          place: context?.place ?? null,
          since: context?.since ?? null,
        };
      }),
  };
}

function placeOf(world: WorldSource): Place | null {
  const home = world.settings.read();
  return {
    timeZone: home.time_zone,
    location:
      home.latitude === null || home.longitude === null
        ? null
        : { latitude: home.latitude, longitude: home.longitude },
  };
}

function runRecorder(
  parts: HubEngineParts,
  questions: Pick<QuestionDesk, 'closeRun'>,
): (finished: FinishedRun) => void {
  const { store, events, clock } = parts;
  const recorded = async (finished: FinishedRun, lastRunAt: string): Promise<void> => {
    const record = await store.host.call('automationRunRecords', 'byId', finished.runId);
    const cancelled = finished.outcome === 'cancelled';
    const error =
      finished.error ??
      (cancelled ? failureLine(new AutomationRunCancelledError(finished.runId)) : null);
    if (record.parent_run_id === null) {
      events.record({
        deviceId: null,
        kind: 'automation_run',
        occurredAt: record.started_at ?? record.created_at,
        details: {
          automationId: finished.automationId,
          name: finished.name,
          outcome: finished.outcome === 'succeeded' ? 'succeeded' : 'failed',
          durationMs: finished.durationMs,
          error,
        },
      });
    }
    await store.host.write('noteAutomationRun', {
      automationId: finished.automationId,
      run: { lastRunAt, lastError: finished.outcome === 'succeeded' ? null : error },
    });
  };
  return (finished) => {
    background(questions.closeRun(finished.runId), 'automation.question_close_failed', {
      runId: finished.runId,
    });
    background(recorded(finished, clock.now().toISOString()), 'automation.run_record_failed', {
      runId: finished.runId,
    });
  };
}

function keptDataOf(parts: HubEngineParts, memory: AutomationMemory): KeptData {
  return new KeptData({
    rows: memory.state,
    reset: (reset): void => {
      parts.log.warn('automation.kept_data_reset', { ...reset });
      parts.events.record({
        deviceId: null,
        kind: 'automation_run',
        occurredAt: parts.clock.now().toISOString(),
        details: { automationId: reset.automationId, message: reset.message },
      });
    },
  });
}

interface WorldParts {
  readonly memory: AutomationMemory;
  readonly kept: KeptData;
  readonly kinds: KindCatalog;
  readonly world: WorldSource;
}

function worldOf(parts: HubEngineParts, { memory, kept, kinds, world }: WorldParts): WorldReadDeps {
  const { store } = parts;
  return {
    kinds,
    store,
    world,
    executor: parts.executor,
    clock: parts.clock,
    observed: (deviceId, capability) => parts.state.valueOf(deviceId, capability),
    presence: presenceOf(world),
    persistent: withKeptData(persistentFromOwned(memory.owned), kept),
    random: seededRandom,
    memory: nodeMemoryFromState(memory.state),
    stateRows: memory.state,
    signals: { latest: (filter) => parts.signals.latest(filter) },
  };
}

function notices(parts: HubEngineParts): Pick<EngineAssemblyPorts, 'refused' | 'storm'> {
  return {
    refused: (start): void => {
      parts.log.info('automation.start_refused', {
        automationId: start.automationId,
        reason: start.reason,
      });
    },
    storm: (automationId, name): void => {
      parts.events.record({
        deviceId: null,
        kind: 'automation_run',
        occurredAt: parts.clock.now().toISOString(),
        details: {
          automationId,
          name,
          message: 'Paused for a moment because it started too often.',
        },
      });
    },
  };
}

interface Slots {
  readonly ai: AutomationAiSlot;
  readonly computers: AutomationComputersSlot;
  readonly integration: AutomationIntegrationSlot;
  readonly images: AutomationImagesSlot;
  readonly drive: AutomationDriveSlot;
  readonly trace: AutomationTraceSlot;
}

interface Wiring {
  readonly engineStore: EngineStore;
  readonly source: WorldMirror;
  readonly watchState: HostWatchState;
  readonly ledger: HostKindLedger;
  readonly memory: AutomationMemory;
  readonly slots: Slots;
  readonly secrets: AutomationSecrets;
  readonly world: WorldReadDeps;
  readonly kept: KeptData;
  readonly questions: QuestionDesk;
  readonly drivers: DriverNodes;
}

function issuerOf(parts: HubEngineParts): CommandIssuer {
  const { store, database, executor, clock } = parts;
  return new CommandIssuer({ store, database, executor, clock });
}

function extraEffectsOf(parts: HubEngineParts, wiring: Wiring): EffectHandlers {
  const { slots, questions } = wiring;
  const effectPorts = {
    store: parts.store,
    clock: parts.clock,
    events: parts.events,
    ai: slots.ai,
    computers: slots.computers,
    questions,
  };
  return {
    ...hubEffectHandlers(effectPorts),
    ...integrationEffects(slots.integration),
    ...pluginNodeEffects({
      ...effectPorts,
      signals: { subscribe: (listener) => parts.signals.subscribe(listener) },
      tools: () => wiring.drivers.over(() => slots.ai.current().tools),
      drivers: wiring.drivers,
    }),
    ...coreNodeEffects({
      ...effectPorts,
      integration: slots.integration,
      images: slots.images,
      drive: { change: (caller, change) => slots.drive.current().change(caller, change) },
      issuer: issuerOf(parts),
      setter: new DeviceSetter({
        store: parts.store,
        executor: parts.executor,
        issuer: issuerOf(parts),
      }),
    }),
  };
}

function enginePorts(parts: HubEngineParts, wiring: Wiring): EngineAssemblyPorts {
  const { slots, secrets, world, kept, questions } = wiring;
  const { store, clock, executor } = parts;
  return {
    store,
    repositories: { store: wiring.engineStore, runs: hostRunLedger(store.host) },
    memory: wiring.memory,
    clock,
    signals: { subscribe: (listener) => parts.signals.subscribe(listener) },
    watchState: wiring.watchState,
    ready: async (): Promise<void> => {
      await Promise.all([wiring.source.load(), wiring.watchState.prepare(), wiring.ledger.load()]);
    },
    isPulse: (matcher) =>
      matcher.field === undefined || matcher.source !== 'weather'
        ? kindSpecOf(installedSignalSources(store.live.home), matcher)?.pulse === true
        : false,
    executor,
    effects: parts.effects,
    issuer: issuerOf(parts),
    secrets,
    world,
    kept,
    place: () => placeOf(world.world),
    zone: () => world.world.settings.read().time_zone,
    retain: (runId, rows): void => {
      background(
        store.host.call('automationRuns', 'retainCommands', runId, rows),
        'automation.run_write_failed',
        { runId },
      );
    },
    decisions: hostDecisionLog(store.host),
    recordRun: runRecorder(parts, questions),
    questions,
    ...notices(parts),
    extraEffects: extraEffectsOf(parts, wiring),
    trace: { watched: slots.trace.watched, publish: slots.trace.publish },
    log: parts.log,
  };
}

function newSlots(): Slots {
  return {
    ai: new AutomationAiSlot(),
    computers: new AutomationComputersSlot(),
    integration: new AutomationIntegrationSlot(),
    images: new AutomationImagesSlot(),
    drive: new AutomationDriveSlot(),
    trace: new AutomationTraceSlot(),
  };
}

function keptWorldOf(
  parts: HubEngineParts,
  kinds: KindCatalog,
): Pick<Wiring, 'engineStore' | 'memory' | 'kept' | 'world' | 'source' | 'watchState'> {
  const engineStore = hostEngineStore(parts.store.host);
  const source = new WorldMirror(parts.store.feed, parts.store.host, parts.store.live.home);
  const memory = new AutomationMemory({
    writes: engineStore.writes,
    now: (): Date => parts.clock.now(),
  });
  const kept = keptDataOf(parts, memory);
  const world = worldOf(parts, { memory, kept, kinds, world: source });
  const watchState = new HostWatchState(parts.store.host);
  return { engineStore, memory, kept, source, world, watchState };
}

function kindsOf(store: Store): {
  readonly ledger: HostKindLedger;
  readonly kinds: PluginKindCatalog;
} {
  const ledger = new HostKindLedger(store.feed, store.host, () => kinds.kinds());
  const kinds: PluginKindCatalog = createKindCatalog(undefined, ledger);
  persistPluginKinds(kinds, ledger.writes);
  return { ledger, kinds };
}

function wiringOf(parts: HubEngineParts): Wiring & { readonly kinds: PluginKindCatalog } {
  const { store, clock } = parts;
  const { ledger, kinds } = kindsOf(store);
  return {
    ...keptWorldOf(parts, kinds),
    ledger,
    kinds,
    secrets: automationSecrets(parts.secrets, secretUsers(store.host, kinds), clock.now),
    slots: newSlots(),
    questions: new QuestionDesk({ host: store.host, clock }),
    drivers: kinds.driverNodes,
  };
}

export function assembleHubEngine(parts: HubEngineParts): HubEngine {
  const { store, clock } = parts;
  const wiring = wiringOf(parts);
  const { slots, world, source, secrets, questions, kinds } = wiring;
  const webhooks = new WebhookGateway({
    signals: parts.signals,
    replies: new WebhookReplies(),
    clock,
    token: randomUUID,
  });
  const timers = new TimerWakes({
    rows: hostTimerRows(store.host),
    clock,
    emit: parts.signals.emit,
  });
  const assembled = assembleEngineV3({
    ...enginePorts(parts, wiring),
    started: (start) => {
      webhooks.started(start);
    },
    timers,
  });
  webhooks.attach(assembled.engine);
  const rehearsal = rehearsals({
    clock,
    base: world,
    watch: assembled.waits.watch,
    subjectOf: (automationId) => assembled.engine.subjectOf(automationId),
    heldSubject: (automationId) => assembled.engine.heldSubject(automationId),
    zone: () => source.settings.read().time_zone,
  });
  return {
    engine: assembled.engine,
    secrets,
    ...slots,
    rehearsals: rehearsal,
    webhooks,
    timers,
    questions,
    kinds,
    world: source,
  };
}
