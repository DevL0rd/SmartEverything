import type {
  CameraQuality,
  CommandRow,
  JsonValue,
  MediaSize,
  RowChange,
} from '@smarteverything/domain';
import { ApiError, jsonEquals } from '@smarteverything/domain';
import { XiaomiAdapter } from './adapters/xiaomi';
import { xiaomiLocalHooks } from './adapters/xiaomi/local-hooks';
import { areaOf, assemble, reportFailure, type Core, type HubParts } from './hub-assembly';
import { LocalDevices } from './local/local-devices';
import { startDrivers, type RunningDrivers } from './local/driver-runtime';
import type { AutomationAiSlot } from './automations/automation-ai';
import type { AutomationComputersSlot } from './automations/automation-computers';
import type { AutomationIntegrationSlot } from './automations/automation-integration';
import type { AutomationTraceSlot } from './automations/automation-trace';
import type { QuestionDesk } from './automations/questions/desk';
import type { WebhookGateway } from './automations/webhooks/gateway';
import type { EngineV3 } from './automations/engine-v3';
import type { AutomationSecrets } from './automations/secrets-v3';
import type { Rehearsals } from './server/handlers/automation-runs';
import type { SignalBus } from './signals/bus';
import { feedSignals } from './signals/sources/feed';
import { feedContextOf } from './signals/sources/feed-context';
import { recentSleepEnd } from './signals/sources/sleep-end';
import { ScaleReadings } from './local/scale-readings';
import type { BluetoothIdentity } from './local/setup-types';
import { LocalWatches } from './local/watches';
import { phoneNodesOf, type PhoneNodes } from './phones/phone-nodes';
import type { DeviceRecord, EventInsert } from './database/port';
import type { ProviderManager } from './providers/manager';
import type { NewCommand } from './store/repositories/commands';
import { background } from '@smarteverything/logging';

export type { HubParts };

export interface RunningHub {
  readonly submit: (commands: readonly NewCommand[]) => CommandRow[];
  readonly recordEvent: (event: Omit<EventInsert, 'occurredAt'>) => Promise<string>;
  readonly endDeviceEffect: (id: string) => Promise<void>;
  readonly answerOffer: (
    deviceId: string,
    sdp: string,
    clientId: string,
    quality: CameraQuality,
  ) => Promise<string>;
  readonly answerTalk: (deviceId: string, sdp: string, clientId: string) => Promise<string>;
  readonly snapshot: (deviceId: string, size: MediaSize) => Promise<Uint8Array>;
  readonly streamReady: (deviceId: string) => Promise<void>;
  readonly setDeviceOnline: (deviceId: string, online: boolean) => Promise<void>;
  readonly settled: () => Promise<void>;
  readonly providers: Pick<ProviderManager, 'link' | 'answer' | 'cancelLink'>;
  readonly local: LocalDevices;
  readonly watches: LocalWatches;
  readonly readings: ScaleReadings;
  readonly drivers: RunningDrivers;
  readonly phones: PhoneNodes;
  readonly signals: SignalBus;
  readonly automationAi: AutomationAiSlot;
  readonly automationComputers: AutomationComputersSlot;
  readonly automationIntegration: AutomationIntegrationSlot;
  readonly automationTrace: AutomationTraceSlot;
  readonly automationWebhooks: WebhookGateway;
  readonly automationQuestions: QuestionDesk;
  readonly automationEngine: EngineV3;
  readonly automationSecrets: AutomationSecrets;
  readonly automationRehearsals: Rehearsals;
  readonly stop: () => Promise<void>;
}

function placeChanged(change: Extract<RowChange, { table: 'settings' }>): boolean {
  const { record, oldRecord } = change;
  if (record === null || oldRecord === null) {
    return true;
  }
  return (
    record.time_zone !== oldRecord.time_zone ||
    record.latitude !== oldRecord.latitude ||
    record.longitude !== oldRecord.longitude
  );
}

function pluginSignalsChanged(change: Extract<RowChange, { table: 'plugins' }>): boolean {
  const { record, oldRecord } = change;
  return record === null || oldRecord === null || !jsonEquals(record.manifest, oldRecord.manifest);
}

function engineConcerned(change: Extract<RowChange, { table: 'automations' }>): boolean {
  const { record, oldRecord } = change;
  if (record === null || oldRecord === null) return true;
  return (
    record.revision !== oldRecord.revision ||
    record.enabled !== oldRecord.enabled ||
    record.name !== oldRecord.name
  );
}

function reloadAutomations(core: Core, change: RowChange): void {
  if (change.table === 'automations') {
    const id = (change.record ?? change.oldRecord)?.id;
    if (id !== undefined && engineConcerned(change)) core.engine.reload(id);
  } else if (
    (change.table === 'settings' && placeChanged(change)) ||
    (change.table === 'plugins' && pluginSignalsChanged(change))
  ) {
    core.engine.sync();
  }
}

function reacting(parts: HubParts, core: Core): (change: RowChange) => void {
  const log = areaOf(parts, 'changes');
  return (change) => {
    if (change.table === 'cameras' && change.record !== null) {
      core.cameras.cameraChanged(change.record);
    }
    core.irAssumed.observe(change);
    core.outages.observe(change);
    const now = parts.clock.now();
    const moment = feedContextOf(
      now,
      () => parts.store.settings.read().time_zone,
      (profileId) => recentSleepEnd(parts.store, profileId, now),
    );
    for (const signal of feedSignals(change, moment)) {
      core.signals.emit(signal);
    }
    try {
      reloadAutomations(core, change);
    } catch (cause) {
      reportFailure(log, 'automations.reload_failed')(cause);
    }
  };
}

interface LocalParts {
  readonly local: LocalDevices;
  readonly watches: LocalWatches;
  readonly readings: ScaleReadings;
  readonly phones: PhoneNodes;
}

function xiaomiOf(core: Core, purpose: string): XiaomiAdapter {
  const adapter = core.providers.adapterFor('xiaomi');
  if (!(adapter instanceof XiaomiAdapter)) {
    throw new ApiError('conflict', `Link your Xiaomi account first to read ${purpose}.`);
  }
  return adapter;
}

function startLocal(parts: HubParts, core: Core): LocalParts {
  const readings = new ScaleReadings({
    store: parts.store,
    log: areaOf(parts, 'scale'),
  });
  const wearables = (): ReturnType<XiaomiAdapter['wearables']> =>
    xiaomiOf(core, 'your watch’s key').wearables();
  const local = new LocalDevices({
    store: parts.store,
    secrets: parts.secrets,
    readings,
    identities: (did, model): Promise<BluetoothIdentity> =>
      xiaomiOf(core, 'the device’s Bluetooth key').bluetoothIdentity(did, model),
    state: core.state,
    ...xiaomiLocalHooks(parts.store, () => core.providers.adapterFor('xiaomi')),
    wearables,
    apply: (devices): Promise<readonly DeviceRecord[]> => core.inventory.apply('local', devices),
    forget: (externalIds): Promise<void> => core.inventory.remove('local', externalIds),
    log: areaOf(parts, 'local'),
    now: parts.clock.now,
  });
  const watches = new LocalWatches({
    store: parts.store,
    secrets: parts.secrets,
    local,
    wearables,
    state: core.state,
    now: parts.clock.now,
    log: areaOf(parts, 'watch'),
  });
  return { local, watches, readings, phones: phoneNodesOf(parts, core) };
}

async function flushWrites(core: Core, closing: boolean): Promise<void> {
  await core.executor.settled();
  await Promise.all([
    closing ? core.state.close() : core.state.settled(),
    closing ? core.events.close() : core.events.settled(),
  ]);
  if (closing) core.signals.close();
}

function sharedParts(
  parts: HubParts,
  core: Core,
): Pick<
  RunningHub,
  | 'providers'
  | 'signals'
  | 'automationAi'
  | 'automationComputers'
  | 'automationIntegration'
  | 'automationTrace'
  | 'automationWebhooks'
  | 'automationQuestions'
  | 'automationEngine'
  | 'automationSecrets'
  | 'automationRehearsals'
  | 'recordEvent'
  | 'setDeviceOnline'
> {
  return {
    providers: core.providers,
    signals: core.signals,
    automationAi: core.automationAi,
    automationComputers: core.automationComputers,
    automationIntegration: core.automationIntegration,
    automationTrace: core.automationTrace,
    automationWebhooks: core.automationWebhooks,
    automationQuestions: core.automationQuestions,
    automationEngine: core.engine,
    automationSecrets: core.automationSecrets,
    automationRehearsals: core.automationRehearsals,
    recordEvent: (event) =>
      core.events.append({ ...event, occurredAt: parts.clock.now().toISOString() }),
    setDeviceOnline: (deviceId, online) => core.inventory.setOnlineById(deviceId, online),
  };
}

async function caughtUp(parts: HubParts, core: Core): Promise<void> {
  const count = await core.executor.catchUp();
  areaOf(parts, 'commands').info('commands.caught_up', { count });
  announceStart(parts, core);
  core.automationTimers.start();
}

const STOPPED_MARK = 'stopped';

function downForOf(parts: HubParts, now: Date): Readonly<Record<string, JsonValue>> {
  const stopped = parts.store.hubMarks.read(STOPPED_MARK);
  parts.store.hubMarks.clear(STOPPED_MARK);
  return stopped === null ? {} : { downFor: Math.max(0, now.getTime() - Date.parse(stopped)) };
}

function quiet(parts: HubParts, core: Core, unsubscribe: () => void): void {
  unsubscribe();
  core.automationTimers.stop();
  parts.store.hubMarks.write(STOPPED_MARK, parts.clock.now().toISOString());
}

function announceStart(parts: HubParts, core: Core): void {
  const now = parts.clock.now();
  core.signals.emit({
    source: 'hub',
    kind: 'started',
    subject: null,
    field: null,
    value: true,
    previous: null,
    at: now.toISOString(),
    profileId: null,
    data: downForOf(parts, now),
  });
}

export async function startHub(parts: HubParts): Promise<RunningHub> {
  const core = assemble(parts);
  await core.inventory.load();
  await Promise.all([core.state.load(), core.cameras.load()]);
  await core.cameras.sync(core.inventory.all());
  parts.devicesChanged(core.inventory.all());
  core.engine.sync();
  core.engine.boot();
  const unsubscribe = parts.store.feed.subscribe(reacting(parts, core));
  await core.providers.startLinked();
  const { local, watches, readings, phones } = startLocal(parts, core);
  await local.start();
  const drivers = startDrivers(parts, core);
  readings.recomputeOutdated();
  await core.effects.recover();
  await caughtUp(parts, core);
  return {
    endDeviceEffect: (id) => core.effects.end(id, () => undefined),
    submit: (commands): CommandRow[] => {
      const rows = parts.store.commands.insert(commands);
      for (const row of rows) {
        background(core.executor.run(row), 'executor.run_failed');
      }
      return rows;
    },
    answerOffer: (deviceId, sdp, clientId, quality) =>
      core.cameras.answer(deviceId, sdp, clientId, quality),
    answerTalk: (deviceId, sdp, clientId) => core.cameras.talk(deviceId, sdp, clientId),
    snapshot: (deviceId, size) => core.cameras.snapshot(deviceId, size),
    streamReady: (deviceId) => core.cameras.streamReady(deviceId),
    settled: (): Promise<void> => flushWrites(core, false),
    local,
    watches,
    readings,
    drivers,
    phones,
    ...sharedParts(parts, core),
    stop: async (): Promise<void> => {
      quiet(parts, core, unsubscribe);
      core.engine.shutdown();
      await core.engine.driver.settled();
      await core.effects.stop();
      core.automationAi.stop();
      core.automationIntegration.stop();
      await drivers.stop();
      await core.providers.stopAll();
      await flushWrites(core, true);
    },
  };
}
