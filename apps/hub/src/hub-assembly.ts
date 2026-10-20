import { DeviceEffects } from './commands/effects';
import { IrAssumedState } from './infrared/assumed-state';
import { preparePassiveAdapter } from './local/passive-adapter';
import { isPrivate, privacySwitchOf, type JsonValue, type Provider } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { StoredAccount } from './adapters/contract';
import type { AutomationAiSlot } from './automations/automation-ai';
import type { AutomationComputersSlot } from './automations/automation-computers';
import type { AutomationIntegrationSlot } from './automations/automation-integration';
import type { AutomationTraceSlot } from './automations/automation-trace';
import type { EngineV3 } from './automations/engine-v3';
import { assembleHubEngine } from './automations/hub-engine';
import type { QuestionDesk } from './automations/questions/desk';
import type { TimerWakes } from './automations/timers/timer-wakes';
import type { WebhookGateway } from './automations/webhooks/gateway';
import type { AutomationSecrets } from './automations/secrets-v3';
import type { Rehearsals } from './server/handlers/automation-runs';
import type { CameraRefusals } from './cameras/camera-health';
import { CameraService, type CameraConditions } from './cameras/camera-service';
import type { Go2rtcClient } from './cameras/go2rtc-client';
import type { Clock } from './clock';
import { applyDirectLinks } from './commands/television-direct-link';
import { CommandExecutor } from './commands/executor';
import { televisionRouting } from './commands/television-assembly';
import type { DeviceRecord, HubDatabase } from './database/port';
import { DeviceDriverRegistry } from './local/device-driver';
import { ProviderManager } from './providers/manager';
import { ProviderOutages } from './providers/outages';
import type { ModuleRegistry } from './providers/registry-types';
import type { SecretStore } from './secrets/store';
import { SignalBus } from './signals/bus';
import { recordFeedSignals } from './signals/feed-recorder';
import { eventSignal } from './signals/sources/device';
import { DeviceSignals } from './signals/sources/device-signals';
import { TriggerSwitches } from './signals/trigger-switches';
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
  readonly cameraRefusal: CameraRefusals;
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
  readonly outages: ProviderOutages;
  readonly executor: CommandExecutor;
  readonly effects: DeviceEffects;
  readonly engine: EngineV3;
  readonly automationSecrets: AutomationSecrets;
  readonly automationRehearsals: Rehearsals;
  readonly cameras: CameraService;
  readonly signals: SignalBus;
  readonly automationAi: AutomationAiSlot;
  readonly automationComputers: AutomationComputersSlot;
  readonly automationIntegration: AutomationIntegrationSlot;
  readonly automationTrace: AutomationTraceSlot;
  readonly automationWebhooks: WebhookGateway;
  readonly automationTimers: TimerWakes;
  readonly automationQuestions: QuestionDesk;
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

function stateWriterOf(
  parts: HubParts,
  inventory: Inventory,
  laundry: CycleTracker,
  deviceSignals: DeviceSignals,
): StateWriter {
  return new StateWriter({
    store: parts.database,
    inventory,
    clock: parts.clock,
    log: areaOf(parts, 'state'),
    changed: (change): void => {
      laundry.observe(change);
    },
    moved: (change): void => {
      deviceSignals.moved(change);
    },
  });
}

function assembleWriters(
  parts: HubParts,
  cameras: CameraService,
  signals: SignalBus,
  laundry: CycleTracker,
): Pick<Core, 'inventory' | 'state' | 'events' | 'outages'> {
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
  const outages = new ProviderOutages({ events, now: parts.clock.now });
  const deviceSignals = new DeviceSignals({ store: parts.store, signals, now: parts.clock.now });
  const inventory = new Inventory(parts.database, {
    onlineChanged: ({ device, online }): void => {
      deviceSignals.online(device, online);
      if (outages.covers(device.provider)) {
        return;
      }
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
    lifecycle: (change): void => {
      deviceSignals.lifecycle(change);
    },
  });
  const state = stateWriterOf(parts, inventory, laundry, deviceSignals);
  recordFeedSignals({ signals, events });
  return { inventory, state, events, outages };
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
        await applyDirectLinks(parts.store, writers.inventory, account);
      }
      if (await parts.accountChanged(provider, account)) {
        await cameras.resync(writers.inventory.all());
      }
    },
    log: areaOf(parts, 'providers'),
  });
}

function signalBusOf(parts: HubParts): SignalBus {
  const triggers = new TriggerSwitches(parts.store);
  return new SignalBus({
    log: areaOf(parts, 'signals'),
    now: parts.clock.now,
    at: parts.clock.at,
    triggers: triggers.current,
  });
}

function cameraServiceOf(
  parts: HubParts,
  writers: () => Pick<Core, 'inventory' | 'state'>,
): CameraService {
  return new CameraService({
    client: parts.go2rtc,
    conditions: cameraConditions(parts, writers),
    refusal: parts.cameraRefusal,
    store: parts.database,
    now: parts.clock.now,
    log: areaOf(parts, 'cameras'),
  });
}

export function assemble(parts: HubParts): Core {
  const cameras = cameraServiceOf(parts, () => writers);
  const signals = signalBusOf(parts);
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
    television: televisionRouting({ ...parts, ...writers, adapters: providers, signals }),
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

function assembleAutomationCore(
  parts: HubParts,
  writers: Pick<Core, 'state' | 'events'>,
  signals: SignalBus,
  commands: { readonly executor: CommandExecutor; readonly effects: DeviceEffects },
): Pick<
  Core,
  | 'engine'
  | 'automationSecrets'
  | 'automationRehearsals'
  | 'automationAi'
  | 'automationComputers'
  | 'automationIntegration'
  | 'automationTrace'
  | 'automationWebhooks'
  | 'automationTimers'
  | 'automationQuestions'
> {
  const hubEngine = assembleHubEngine({
    store: parts.store,
    database: parts.database,
    secrets: parts.secrets,
    clock: parts.clock,
    log: areaOf(parts, 'automations'),
    state: writers.state,
    events: writers.events,
    signals,
    ...commands,
  });
  signals.subscribe((signal) => {
    hubEngine.engine.observe(signal);
  });
  return {
    engine: hubEngine.engine,
    automationSecrets: hubEngine.secrets,
    automationRehearsals: hubEngine.rehearsals,
    automationAi: hubEngine.ai,
    automationComputers: hubEngine.computers,
    automationIntegration: hubEngine.integration,
    automationTrace: hubEngine.trace,
    automationWebhooks: hubEngine.webhooks,
    automationTimers: hubEngine.timers,
    automationQuestions: hubEngine.questions,
  };
}
