import type {
  AutomationRunRow,
  AutomationV2,
  CameraQuality,
  JsonValue,
  CommandRow,
  MediaSize,
  RowChange,
} from '@smarteverything/domain';
import { ApiError, jsonEquals } from '@smarteverything/domain';
import { XiaomiAdapter } from './adapters/xiaomi';
import { xiaomiLocalHooks } from './adapters/xiaomi/local-hooks';
import { onlyRunBookkeeping } from './automations/changes';
import { areaOf, assemble, reportFailure, type Core, type HubParts } from './hub-assembly';
import { LocalDevices } from './local/local-devices';
import { startDrivers, type RunningDrivers } from './local/driver-runtime';
import type { AutomationAiSlot } from './automations/automation-ai';
import type { AutomationComputersSlot } from './automations/automation-computers';
import type { OwnedRunAdmission } from './automations/owned-runs';
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

interface RunRequest {
  readonly inputs: Readonly<Record<string, JsonValue>>;
  readonly wait: boolean;
}

interface TestRequest extends RunRequest {
  readonly automationId: string | undefined;
  readonly definition: AutomationV2;
}

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
  readonly runAutomation: (automationId: string, request: RunRequest) => Promise<AutomationRunRow>;
  readonly testAutomation: (request: TestRequest) => Promise<AutomationRunRow>;
  readonly stopAutomationRun: (runId: string) => AutomationRunRow;
  readonly stopAutomationRuns: (automationId: string, key?: string) => void;
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

function needsReload(change: RowChange): boolean {
  if (change.table === 'automations') {
    return !onlyRunBookkeeping(change);
  }
  if (change.table === 'settings') {
    return placeChanged(change);
  }
  return change.table === 'plugins' && pluginSignalsChanged(change);
}

function invalidatesRuns(change: RowChange): boolean {
  return change.table === 'automations' && !onlyRunBookkeeping(change);
}

function reacting(parts: HubParts, core: Core): (change: RowChange) => void {
  const log = areaOf(parts, 'changes');
  return (change) => {
    if (change.table === 'cameras' && change.record !== null) {
      core.cameras.cameraChanged(change.record);
    }
    core.irAssumed.observe(change);
    const now = parts.clock.now();
    const moment = feedContextOf(
      now,
      () => parts.store.settings.read().time_zone,
      (profileId) => recentSleepEnd(parts.store, profileId, now),
    );
    for (const signal of feedSignals(change, moment)) {
      core.signals.emit(signal);
    }
    if (needsReload(change)) {
      try {
        core.engine.reload();
      } catch (cause) {
        reportFailure(log, 'automations.reload_failed')(cause);
      }
    }
    if (invalidatesRuns(change)) {
      core.runs.revalidate();
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
}

function automationControls(
  parts: HubParts,
  core: Core,
): Pick<
  RunningHub,
  'runAutomation' | 'testAutomation' | 'stopAutomationRun' | 'stopAutomationRuns'
> {
  const finished = async (
    admission: OwnedRunAdmission,
    wait: boolean,
  ): Promise<AutomationRunRow> => {
    if (wait) await admission.finished;
    return parts.store.automationRuns.byId(admission.row.id);
  };
  return {
    runAutomation: (automationId, request) =>
      finished(
        core.runner.startSaved(parts.store.automations.byId(automationId), request.inputs),
        request.wait,
      ),
    testAutomation: (request) =>
      finished(
        core.runner.startDraft({
          automationId: request.automationId,
          definition: request.definition,
          inputs: request.inputs,
        }),
        request.wait,
      ),
    stopAutomationRun: (runId) => core.runs.stop(runId),
    stopAutomationRuns: (automationId, key): void => {
      core.runs.cancelAutomation(automationId, key);
    },
  };
}

function sharedParts(
  parts: HubParts,
  core: Core,
): Pick<
  RunningHub,
  'providers' | 'signals' | 'automationAi' | 'automationComputers' | 'recordEvent'
> {
  return {
    providers: core.providers,
    signals: core.signals,
    automationAi: core.automationAi,
    automationComputers: core.automationComputers,
    recordEvent: (event) =>
      core.events.append({ ...event, occurredAt: parts.clock.now().toISOString() }),
  };
}

export async function startHub(parts: HubParts): Promise<RunningHub> {
  const core = assemble(parts);
  await core.inventory.load();
  await Promise.all([core.state.load(), core.cameras.load()]);
  await core.cameras.sync(core.inventory.all());
  parts.devicesChanged(core.inventory.all());
  core.engine.reload();
  const unsubscribe = parts.store.feed.subscribe(reacting(parts, core));
  await core.providers.startLinked();
  const { local, watches, readings, phones } = startLocal(parts, core);
  await local.start();
  const drivers = startDrivers(parts, core);
  readings.recomputeOutdated();
  await core.effects.recover();
  const caughtUp = await core.executor.catchUp();
  areaOf(parts, 'commands').info('commands.caught_up', { count: caughtUp });
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
    ...automationControls(parts, core),
    settled: (): Promise<void> => flushWrites(core, false),
    local,
    watches,
    readings,
    drivers,
    phones,
    ...sharedParts(parts, core),
    stop: async (): Promise<void> => {
      unsubscribe();
      core.engine.stop();
      await core.runs.settled();
      await core.effects.stop();
      core.automationAi.stop();
      await drivers.stop();
      await core.providers.stopAll();
      await flushWrites(core, true);
    },
  };
}
