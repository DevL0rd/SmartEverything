import { speechTriggerArmer } from './automations/speech-trigger';
import { DeviceEffects } from './commands/effects';
import { IrAssumedState } from './infrared/assumed-state';
import { TemporaryChanges } from './automations/temporary-effect';
import { CommandIssuer } from './automations/issue-commands';
import { ProgramSteps } from './automations/program-steps';
import { SetSteps } from './automations/set-step';
import { AutomationWorld } from './automations/world';
import { OwnedAutomationRuns } from './automations/owned-runs';
import { AutomationRunner, type AutomationRun } from './automations/run-task';
import { preparePassiveAdapter } from './local/passive-adapter';
import {
  isPrivate,
  privacySwitchOf,
  type JsonValue,
  type Provider,
  type SignalSourceSpec,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { StoredAccount } from './adapters/contract';
import { ActionRunner } from './automations/actions';
import { AutomationAiSlot } from './automations/automation-ai';
import { AutomationComputersSlot } from './automations/automation-computers';
import { ComputerSteps } from './automations/computer-steps';
import { AutomationEngine } from './automations/engine';
import { CameraService, type CameraConditions } from './cameras/camera-service';
import type { Go2rtcClient } from './cameras/go2rtc-client';
import type { Clock } from './clock';
import { attachedDeviceOf } from './adapters/samsung-tv/link';
import { mirrorDirectLink } from './commands/television-direct-link';
import { CommandExecutor } from './commands/executor';
import { TelevisionRouting } from './commands/television-routing';
import type { DeviceRecord, HubDatabase } from './database/port';
import { DeviceDriverRegistry } from './local/device-driver';
import { ProviderManager } from './providers/manager';
import type { ModuleRegistry } from './providers/registry-types';
import type { SecretStore } from './secrets/store';
import { SignalBus } from './signals/bus';
import { eventSignal, isTransition, stateSignal } from './signals/sources/device';
import { installedSignalSources } from './signals/sources/installed';
import { cycleTrackerOf } from './laundry/assemble';
import type { CycleTracker } from './laundry/cycle-tracker';
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
  readonly runner: AutomationRunner;
  readonly cameras: CameraService;
  readonly signals: SignalBus;
  readonly automationAi: AutomationAiSlot;
  readonly automationComputers: AutomationComputersSlot;
  readonly drivers: DeviceDriverRegistry;
  readonly irAssumed: IrAssumedState;
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
  laundry: CycleTracker,
): Pick<Core, 'inventory' | 'state' | 'events'> {
  const camerasLog = areaOf(parts, 'cameras');
  const events: EventRouter = new EventRouter({
    store: parts.database,
    inventory: { deviceOf: (provider, externalId) => inventory.deviceOf(provider, externalId) },
    log: areaOf(parts, 'events'),
    claim: (device, event) => laundry.claim(device, event),
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
      if (!isTransition(change)) return;
      signals.emit(stateSignal(change, parts.clock.now().toISOString()));
      laundry.observe(change);
    },
  });
  return { inventory, state, events };
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

function televisionRouting(
  parts: HubParts,
  adapters: ProviderManager,
  state: Pick<StateWriter, 'valueOf'>,
): TelevisionRouting {
  return new TelevisionRouting({
    adapters,
    valueOf: (deviceId, capability): JsonValue | undefined => state.valueOf(deviceId, capability),
    attachedTo: (): string | null => attachedDeviceOf(parts.secrets.read().accounts.samsung_tv),
    log: areaOf(parts, 'television'),
  });
}

function providerManager(
  parts: HubParts,
  writers: Pick<Core, 'inventory' | 'state' | 'events'>,
  cameras: CameraService,
): ProviderManager {
  return new ProviderManager({
    prepareAdapter: (adapter): void => {
      preparePassiveAdapter(adapter, parts);
    },
    ...writers,
    registry: parts.registry,
    secrets: parts.secrets,
    store: parts.database,
    dataDirectory: parts.dataDirectory,
    accountChanged: async (provider, account): Promise<void> => {
      if (provider === 'samsung_tv') {
        mirrorDirectLink(parts.store, account);
      }
      if (await parts.accountChanged(provider, account)) {
        await cameras.resync(writers.inventory.all());
      }
    },
    log: areaOf(parts, 'providers'),
  });
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
  const laundry = cycleTrackerOf(
    { store: parts.store, now: parts.clock.now, log: areaOf(parts, 'laundry') },
    () => writers,
  );
  const writers = assembleWriters(parts, cameras, signals, laundry);
  const providers = providerManager(parts, writers, cameras);
  const drivers = new DeviceDriverRegistry();
  const effects = new DeviceEffects(parts.store, areaOf(parts, 'effects'));
  const executor = new CommandExecutor({
    effects,
    television: televisionRouting(parts, providers, writers.state),
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
  const irAssumed = new IrAssumedState({
    store: parts.store,
    now: parts.clock.now,
    log: areaOf(parts, 'infrared'),
  });
  return {
    ...writers,
    drivers,
    providers,
    executor,
    effects,
    ...automation,
    cameras,
    signals,
    irAssumed,
  };
}

interface StepRuntime {
  readonly executor: CommandExecutor;
  readonly effects: DeviceEffects;
  readonly runs: OwnedAutomationRuns;
  readonly ai: AutomationAiSlot;
  readonly computers: AutomationComputersSlot;
  readonly world: AutomationWorld;
  readonly call: ProgramSteps['call'];
}

function assembleActions(parts: HubParts, events: EventRouter, runtime: StepRuntime): ActionRunner {
  const { store, clock } = parts;
  const { executor, effects, runs, ai, computers, world, call } = runtime;
  const issuer = new CommandIssuer({ store, database: parts.database, executor, clock });
  const changes = new TemporaryChanges(store, clock, effects, world);
  return new ActionRunner({
    sets: new SetSteps({ store, executor, world, issuer, changes }),
    program: new ProgramSteps(store, world, runs, call),
    computers: new ComputerSteps(computers),
    issuer,
    clock,
    ai,
    world,
    notify: (origin, message): void => {
      events.record({
        deviceId: null,
        kind: 'automation_run',
        occurredAt: clock.now().toISOString(),
        details: { automationId: origin.automationId, name: origin.name, message },
      });
    },
  });
}

function assembleEngine(
  parts: HubParts,
  signals: SignalBus,
  links: Pick<Core, 'runs' | 'runner'> & { readonly world: AutomationWorld },
): AutomationEngine {
  const { store, clock } = parts;
  const engine = new AutomationEngine({
    store,
    runner: links.runner,
    world: links.world,
    armers: [speechTriggerArmer(store)],
    sources: (): readonly SignalSourceSpec[] => installedSignalSources(store),
    stopRuns: (): void => {
      links.runs.shutdown();
    },
    clock,
    log: areaOf(parts, 'automations'),
  });
  signals.subscribe((signal) => {
    engine.signal(signal);
  });
  return engine;
}

function assembleAutomationCore(
  parts: HubParts,
  writers: Pick<Core, 'state' | 'events'>,
  signals: SignalBus,
  commands: { readonly executor: CommandExecutor; readonly effects: DeviceEffects },
): Pick<Core, 'engine' | 'runs' | 'runner' | 'automationAi' | 'automationComputers'> {
  const { store, clock } = parts;
  const automationAi = new AutomationAiSlot();
  const automationComputers = new AutomationComputersSlot();
  const runs = new OwnedAutomationRuns(store.automationRuns, clock);
  const world = new AutomationWorld({
    store,
    executor: commands.executor,
    clock,
    observed: (deviceId, capability): JsonValue | undefined =>
      writers.state.valueOf(deviceId, capability),
  });
  const actions = assembleActions(parts, writers.events, {
    ...commands,
    runs,
    world,
    ai: automationAi,
    computers: automationComputers,
    call: (request) => runner.call(request),
  });
  const runner: AutomationRunner = new AutomationRunner({
    store,
    runs,
    actions: () => actions,
    clock,
    log: areaOf(parts, 'automations'),
    recordRun: (run): void => {
      recordAutomationRun(writers.events, run);
    },
  });
  const engine = assembleEngine(parts, signals, { runs, runner, world });
  return { engine, runs, runner, automationAi, automationComputers };
}
