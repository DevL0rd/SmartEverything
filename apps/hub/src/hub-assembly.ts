import { speechTriggerArmer } from './automations/speech-trigger';
import { DeviceEffects } from './commands/effects';
import { temporaryEffectService } from './automations/temporary-effect';
import { automationTargetCommand } from './automations/target-command';
import { AutomationSequences } from './automations/sequences';
import { automationBindings, boundAutomationCommand } from './automations/bindings';
import { conditionsHold, GEO_POINT } from '@smarteverything/domain';
import type { StructuredActionServices } from './automations/structured-actions';
import { OwnedAutomationRuns } from './automations/owned-runs';
import { ownedRunTask } from './automations/run-task';
import { preparePassiveAdapter } from './local/passive-adapter';
import { withEffectAuthority } from './harness/effect-authority';
import {
  isPrivate,
  privacySwitchOf,
  type CommandAction,
  type GeoPoint,
  type JsonValue,
  type Provider,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { StoredAccount } from './adapters/contract';
import { ActionRunner } from './automations/actions';
import {
  finishAutomationCommands,
  submitAutomationCommands,
} from './automations/command-submission';
import { admitManualAutomation } from './automations/manual-run';
import { AutomationAiSlot } from './automations/automation-ai';
import { AutomationEngine, type AutomationRun } from './automations/engine';
import { CameraService, type CameraConditions } from './cameras/camera-service';
import type { Go2rtcClient } from './cameras/go2rtc-client';
import type { Clock } from './clock';
import { CommandExecutor } from './commands/executor';
import type { DeviceRecord, HubDatabase } from './database/port';
import { DeviceDriverRegistry } from './local/device-driver';
import { ProviderManager } from './providers/manager';
import type { ModuleRegistry } from './providers/registry-types';
import type { SecretStore } from './secrets/store';
import { SignalBus } from './signals/bus';
import { eventSignal, stateSignal } from './signals/sources/device';
import { installedSignalSources } from './signals/sources/installed';
import { EventRouter } from './state/event-router';
import { Inventory } from './state/inventory';
import { StateWriter } from './state/state-writer';
import type { Store } from './store/store';

export interface HubParts {
  readonly store: Store;
  readonly database: HubDatabase;
  readonly accountChanged: (provider: Provider, account: StoredAccount | null) => Promise<boolean>;
  readonly registry: ModuleRegistry;
  readonly secrets: SecretStore;
  readonly go2rtc: Go2rtcClient;
  readonly devicesChanged: (devices: readonly DeviceRecord[]) => void;
  readonly dataDirectory: string;
  readonly clock: Clock;
  readonly logFor: (area: string) => Logger;
}

export interface Core {
  readonly inventory: Inventory;
  readonly state: StateWriter;
  readonly events: EventRouter;
  readonly providers: ProviderManager;
  readonly executor: CommandExecutor;
  readonly effects: DeviceEffects;
  readonly engine: AutomationEngine;
  readonly runs: OwnedAutomationRuns;
  readonly sequences: AutomationSequences;
  readonly cameras: CameraService;
  readonly signals: SignalBus;
  readonly automationAi: AutomationAiSlot;
  readonly drivers: DeviceDriverRegistry;
}

interface ActionLinks {
  readonly engine: () => AutomationEngine;
  readonly ai: AutomationAiSlot;
  readonly waitForCommands?: boolean;
  readonly structured?: StructuredActionServices;
}

export function reportFailure(log: Logger, event: string): (cause: unknown) => void {
  return (cause) => {
    log.error(event, cause);
  };
}

export function areaOf(parts: HubParts, name: string): Logger {
  return parts.logFor(name);
}

function assembleWriters(
  parts: HubParts,
  cameras: CameraService,
  signals: SignalBus,
): Pick<Core, 'inventory' | 'state' | 'events'> {
  const camerasLog = areaOf(parts, 'cameras');
  const events: EventRouter = new EventRouter({
    store: parts.database,
    inventory: { deviceOf: (provider, externalId) => inventory.deviceOf(provider, externalId) },
    log: areaOf(parts, 'events'),
    recorded: (event): void => {
      signals.emit(eventSignal(event));
      cameras.record(event).catch(reportFailure(camerasLog, 'recording.crashed'));
    },
  });
  const inventory = new Inventory(parts.database, {
    onlineChanged: ({ device, online }): void => {
      events.record({
        deviceId: device.id,
        kind: online ? 'device_online' : 'device_offline',
        occurredAt: parts.clock.now().toISOString(),
        details: {},
      });
    },
    devicesChanged: (devices): void => {
      cameras.sync(devices).catch(reportFailure(camerasLog, 'stream.sync_failed'));
      parts.devicesChanged(inventory.all());
    },
  });
  const state = new StateWriter({
    store: parts.database,
    inventory,
    log: areaOf(parts, 'state'),
    changed: (change): void => {
      signals.emit(stateSignal(change, parts.clock.now().toISOString()));
    },
  });
  return { inventory, state, events };
}

function assembleActions(
  parts: HubParts,
  events: EventRouter,
  executor: CommandExecutor,
  links: ActionLinks,
): ActionRunner {
  return new ActionRunner({
    withOrigin: (origin, work) =>
      withEffectAuthority(
        parts.store,
        origin.targetType ?? 'automation',
        origin.automationId,
        work,
      ),
    ...(links.structured === undefined ? {} : { structured: links.structured }),
    store: parts.database,
    submit: (rows, admitted, authorize): void | Promise<void> => {
      if (links.waitForCommands === true) {
        return finishAutomationCommands(parts.store, parts.clock, executor, {
          rows,
          admitted: admitted === true,
          ...(authorize === undefined ? {} : { authorize }),
        });
      }
      submitAutomationCommands(executor, rows, admitted, authorize);
    },
    sceneActions: (sceneId): readonly CommandAction[] | undefined =>
      links.engine().sceneActions(sceneId),
    notify: (origin, message): void => {
      events.record({
        deviceId: null,
        kind: 'automation_run',
        occurredAt: parts.clock.now().toISOString(),
        details: { automationId: origin.automationId, name: origin.name, message },
      });
    },
    ai: links.ai,
    clock: parts.clock,
  });
}

function recordAutomationRun(events: EventRouter, run: AutomationRun): void {
  events.record({
    deviceId: null,
    kind: 'automation_run',
    occurredAt: run.startedAt,
    details: {
      automationId: run.automationId,
      name: run.name,
      outcome: run.error === null ? 'succeeded' : 'failed',
      durationMs: run.durationMs,
      error: run.error,
    },
  });
}

function cameraConditions(
  parts: HubParts,
  writers: () => Pick<Core, 'inventory' | 'state'>,
): CameraConditions {
  return {
    online: (deviceId): boolean => writers().inventory.deviceById(deviceId)?.online === true,
    privacyOn: (deviceId): boolean => {
      const device = writers().inventory.deviceById(deviceId);
      const privacy = device === undefined ? null : privacySwitchOf(device);
      return privacy !== null && isPrivate(privacy, writers().state.valueOf(deviceId, privacy.key));
    },
    twoWayAudio: (deviceId): boolean =>
      parts.store.cameras
        .list()
        .some((camera) => camera.device_id === deviceId && camera.two_way_audio),
  };
}

function assembleEngine(
  parts: HubParts,
  writers: Pick<Core, 'state' | 'events'>,
  executor: CommandExecutor,
  links: Pick<Core, 'signals' | 'automationAi' | 'runs'> & {
    readonly structured: StructuredActionServices;
  },
): AutomationEngine {
  const { structured } = links;
  const actions = assembleActions(parts, writers.events, executor, {
    engine: () => engine,
    ai: links.automationAi,
    structured,
  });
  const manualActions = assembleActions(parts, writers.events, executor, {
    engine: () => engine,
    ai: links.automationAi,
    structured,
    waitForCommands: true,
  });
  const engine: AutomationEngine = new AutomationEngine({
    store: parts.database,
    ownRun: (request) => links.runs.start(ownedRunTask(parts.store, request)),
    cancelRuns: (): void => {
      links.runs.shutdown();
    },
    recordRun: (run): void => {
      recordAutomationRun(writers.events, run);
    },
    actions: (waitForCommands) => (waitForCommands === true ? manualActions : actions),
    admitManual: (definition) => admitManualAutomation(parts.store, definition),
    valueOf: (deviceId, capability) => writers.state.valueOf(deviceId, capability),
    automationValue: (id) => parts.store.automationValues.byId(id).content.value,
    bindings: () => automationBindings(parts.store, executor, {}),
    forecast: () => parts.store.weather.read().forecast,
    armers: [speechTriggerArmer(parts.store)],
    sources: () => installedSignalSources(parts.store),
    clock: parts.clock,
    log: areaOf(parts, 'automations'),
  });
  links.signals.subscribe((signal) => {
    engine.signal(signal);
  });
  return engine;
}

function structuredServices(
  parts: HubParts,
  executor: CommandExecutor,
  runs: OwnedAutomationRuns,
  runtime: { readonly sequences: AutomationSequences; readonly effects: DeviceEffects },
): StructuredActionServices {
  const { sequences, effects } = runtime;
  const evaluate: StructuredActionServices['conditions'] = (conditions, parameters) =>
    parts.store.write(() =>
      conditionsHold(conditions, {
        bindings: automationBindings(parts.store, executor, parameters),
        now: parts.clock.now(),
        timeZone: parts.store.settings.read().time_zone,
        location: conditionLocation(parts.store),
        forecast: parts.store.weather.read().forecast,
        stateOf: (id, key) =>
          parts.store.state.list().find((row) => row.device_id === id && row.capability === key)
            ?.value,
        valueOf: (id) => parts.store.automationValues.byId(id).content.value,
      }),
    );
  return {
    bindingContext: (parameters) => automationBindings(parts.store, executor, parameters),
    command: boundAutomationCommand(parts.store, executor),
    targetCommand: automationTargetCommand(parts.store, executor),
    value: (id, operation): void => {
      parts.store.automationValues.apply(id, operation);
    },
    sequence: (action, origin, context, parameters) =>
      sequences.call(
        { id: action.sequenceId, parameters: action.parameters, origin },
        context,
        parameters,
      ),
    conditions: evaluate,
    temporaryEffect: temporaryEffectService(parts.store, parts.clock, effects, evaluate),
    stop: (target, context): void => {
      if (target.type === 'current') runs.stop(context.runId);
      else if (target.type === 'run') runs.stop(target.runId);
      else runs.cancelTarget(target.id, target.controlKey);
    },
  };
}

export function assemble(parts: HubParts): Core {
  const cameras = new CameraService({
    client: parts.go2rtc,
    conditions: cameraConditions(parts, () => writers),
    store: parts.database,
    now: parts.clock.now,
    log: areaOf(parts, 'cameras'),
  });
  const signals = new SignalBus({ log: areaOf(parts, 'signals') });
  const writers = assembleWriters(parts, cameras, signals);
  const providers = new ProviderManager({
    prepareAdapter: (adapter): void => {
      preparePassiveAdapter(adapter, parts);
    },
    ...writers,
    registry: parts.registry,
    secrets: parts.secrets,
    store: parts.database,
    dataDirectory: parts.dataDirectory,
    accountChanged: async (provider, account): Promise<void> => {
      if (await parts.accountChanged(provider, account)) {
        await cameras.resync(writers.inventory.all());
      }
    },
    log: areaOf(parts, 'providers'),
  });
  const drivers = new DeviceDriverRegistry();
  const effects = new DeviceEffects(parts.store, parts.clock.now, areaOf(parts, 'effects'));
  const executor = new CommandExecutor({
    effects,
    store: parts.database,
    drivers,
    inventory: writers.inventory,
    adapters: providers,
    hubCommand: (command): Promise<JsonValue> =>
      command.capability === 'hub:record_clip'
        ? cameras.recordClip(command.value.deviceId, command.value.seconds)
        : providers.handle(command),
    log: areaOf(parts, 'commands'),
    now: parts.clock.now,
  });
  effects.attach(executor);
  const automation = assembleAutomationCore(parts, writers, signals, { executor, effects });
  return { ...writers, drivers, providers, executor, effects, ...automation, cameras, signals };
}

function assembleAutomationCore(
  parts: HubParts,
  writers: Pick<Core, 'state' | 'events'>,
  signals: SignalBus,
  commands: { readonly executor: CommandExecutor; readonly effects: DeviceEffects },
): Pick<Core, 'engine' | 'runs' | 'sequences' | 'automationAi'> {
  const { executor, effects } = commands;
  const automationAi = new AutomationAiSlot();
  const runs = new OwnedAutomationRuns(parts.store.automationRuns, parts.clock);
  const sequences = new AutomationSequences(
    parts.store,
    runs,
    () => sequenceRunner,
    (parameters) => automationBindings(parts.store, executor, parameters),
  );
  const structured = structuredServices(parts, executor, runs, { sequences, effects });
  const engine = assembleEngine(parts, writers, executor, {
    signals,
    automationAi,
    runs,
    structured,
  });
  const sequenceRunner = assembleActions(parts, writers.events, executor, {
    engine: () => engine,
    ai: automationAi,
    waitForCommands: true,
    structured,
  });
  return { engine, runs, sequences, automationAi };
}

function conditionLocation(store: Store): GeoPoint | null {
  const settings = store.settings.read();
  const location = GEO_POINT.safeParse({
    latitude: settings.latitude,
    longitude: settings.longitude,
  });
  return location.success ? location.data : null;
}
