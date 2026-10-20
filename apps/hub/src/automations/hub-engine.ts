import { randomUUID } from 'node:crypto';
import {
  NODE_REGISTRY,
  atHomePlace,
  kindSpecOf,
  programReferences,
  type AutomationRowV3,
  type AutomationV3,
  type FunctionV3,
  type Place,
  type ReferenceContext,
} from '@smarteverything/domain';
import { failureLine, type Logger } from '@smarteverything/logging';
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
import { TimerWakes } from './timers/timer-wakes';
import { WebhookGateway } from './webhooks/gateway';
import type { FinishedRun } from './driver/ports';
import { assembleEngineV3 } from './engine-v3-assembly';
import type { EngineAssemblyPorts } from './engine-v3-assembly';
import { AutomationRunCancelledError } from './effects/run-abort';
import type { EngineV3 } from './engine-v3';
import { hubEffectHandlers } from './hub-effects';
import { integrationEffects } from './integration-effects';
import { CommandIssuer } from './issue-commands';
import { automationSecrets } from './secrets-v3';
import type { AutomationSecrets, SecretUsers } from './secrets-v3';
import { rehearsals } from './rehearsals';
import type { Rehearsals } from '../server/handlers/automation-runs';
import type { WorldReadDeps } from './world-v3/deps';
import { nodeMemoryFromState } from './world-v3/node-memory';
import type { PresenceSource } from './world-v3/presence';
import { seededRandom } from './world-v3/random';
import { persistentFromOwned, withKeptData } from './world-v3/variables';
import { KeptData } from './world-v3/kept-data';

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
  readonly trace: AutomationTraceSlot;
  readonly rehearsals: Rehearsals;
  readonly webhooks: WebhookGateway;
  readonly timers: TimerWakes;
  readonly questions: QuestionDesk;
}

function referenceContext(store: Store): ReferenceContext {
  return {
    kinds: (id) => NODE_REGISTRY.get(id),
    functions: (id, pin): FunctionV3 | undefined => {
      const { automationFunctions: functions } = store;
      if (pin !== undefined) return functions.findRevision(id, pin)?.definition;
      return functions.find(id) === undefined ? undefined : functions.latest(id).definition;
    },
  };
}

function programsOf(row: AutomationRowV3): readonly AutomationV3[] {
  return row.draft === null ? [row.definition] : [row.definition, row.draft.program];
}

function secretUsers(store: Store): SecretUsers {
  const context = referenceContext(store);
  return (secretId) =>
    store.automations
      .list()
      .filter((row) =>
        programsOf(row).some((program) => programReferences(program, secretId, context)),
      )
      .map((row) => ({ automationId: row.id, name: row.name }));
}

function presenceOf(store: Store): PresenceSource {
  return {
    people: () =>
      store.profiles.list().map((profile) => {
        const context = store.phoneContexts.latestOf(profile.id);
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

function placeOf(store: Store): Place | null {
  const home = store.settings.read();
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
  return (finished) => {
    questions.closeRun(finished.runId);
    const record = store.automationRunRecords.byId(finished.runId);
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
    if (store.automations.find(finished.automationId) !== undefined) {
      store.automations.recordRun(finished.automationId, {
        lastRunAt: clock.now().toISOString(),
        lastError: finished.outcome === 'succeeded' ? null : error,
      });
    }
  };
}

function keptDataOf(parts: HubEngineParts): KeptData {
  return new KeptData({
    rows: parts.store.automationNodeState,
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

function worldOf(parts: HubEngineParts, kept: KeptData): WorldReadDeps {
  const { store } = parts;
  return {
    store,
    executor: parts.executor,
    clock: parts.clock,
    observed: (deviceId, capability) => parts.state.valueOf(deviceId, capability),
    presence: presenceOf(store),
    persistent: withKeptData(persistentFromOwned(store.automationOwnedValues), kept),
    random: seededRandom,
    memory: nodeMemoryFromState(store.automationNodeState),
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
  readonly trace: AutomationTraceSlot;
}

interface Wiring {
  readonly slots: Slots;
  readonly secrets: AutomationSecrets;
  readonly world: WorldReadDeps;
  readonly kept: KeptData;
  readonly questions: QuestionDesk;
}

function enginePorts(parts: HubEngineParts, wiring: Wiring): EngineAssemblyPorts {
  const { slots, secrets, world, kept, questions } = wiring;
  const { store, clock, executor } = parts;
  return {
    store,
    repositories: {
      programs: store.automations,
      plans: store.automationPlans,
      records: store.automationRunRecords,
      nodes: store.automationRunNodes,
      owned: store.automationOwnedValues,
      functions: store.automationFunctions,
    },
    clock,
    signals: { subscribe: (listener) => parts.signals.subscribe(listener) },
    watchState: store.signalWatchState,
    isPulse: (matcher) =>
      matcher.field === undefined || matcher.source !== 'weather'
        ? kindSpecOf(installedSignalSources(store), matcher)?.pulse === true
        : false,
    executor,
    effects: parts.effects,
    issuer: new CommandIssuer({ store, database: parts.database, executor, clock }),
    secrets,
    world,
    kept,
    place: () => placeOf(store),
    zone: () => store.settings.read().time_zone,
    retain: (runId, rows): void => {
      store.automationRuns.retainCommands(runId, rows);
    },
    decisions: store.automationDecisions,
    recordRun: runRecorder(parts, questions),
    questions,
    ...notices(parts),
    extraEffects: {
      ...hubEffectHandlers({
        store,
        clock,
        events: parts.events,
        ai: slots.ai,
        computers: slots.computers,
        questions,
      }),
      ...integrationEffects(slots.integration),
    },
    trace: { watched: slots.trace.watched, publish: slots.trace.publish },
    log: parts.log,
  };
}

export function assembleHubEngine(parts: HubEngineParts): HubEngine {
  const { store, clock } = parts;
  const slots: Slots = {
    ai: new AutomationAiSlot(),
    computers: new AutomationComputersSlot(),
    integration: new AutomationIntegrationSlot(),
    trace: new AutomationTraceSlot(),
  };
  const secrets = automationSecrets(parts.secrets, secretUsers(store), clock.now);
  const kept = keptDataOf(parts);
  const world = worldOf(parts, kept);
  const webhooks = new WebhookGateway({
    signals: parts.signals,
    replies: new WebhookReplies(),
    clock,
    token: randomUUID,
  });
  const timers = new TimerWakes({
    rows: store.automationNodeState,
    clock,
    emit: parts.signals.emit,
  });
  const questions = new QuestionDesk({ questions: store.automationQuestions, clock });
  const assembled = assembleEngineV3({
    ...enginePorts(parts, { slots, secrets, world, kept, questions }),
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
    zone: () => store.settings.read().time_zone,
  });
  return {
    engine: assembled.engine,
    secrets,
    ...slots,
    rehearsals: rehearsal,
    webhooks,
    timers,
    questions,
  };
}
