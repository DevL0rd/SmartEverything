import type {
  AutomationRunRow,
  JsonValue,
  CommandRow,
  MediaSize,
  RowChange,
} from '@smarteverything/domain';
import { ApiError, jsonEquals } from '@smarteverything/domain';
import { XiaomiAdapter } from './adapters/xiaomi';
import { onlyRunBookkeeping } from './automations/changes';
import { areaOf, assemble, reportFailure, type Core, type HubParts } from './hub-assembly';
import { LocalDevices, type LocalDevicesOptions } from './local/local-devices';
import { startDrivers, type RunningDrivers } from './local/driver-runtime';
import type { AutomationAiSlot } from './automations/automation-ai';
import type { SignalBus } from './signals/bus';
import { feedSignals } from './signals/sources/feed';
import { feedContextOf } from './signals/sources/feed-context';
import { recentSleepEnd } from './signals/sources/sleep-end';
import { ScaleReadings } from './local/scale-readings';
import type { BluetoothIdentity } from './local/setup-types';
import { LocalWatches } from './local/watches';
import { phoneNodesOf, type PhoneNodes } from './phones/phone-nodes';
import type { DeviceRecord } from './database/port';
import type { NewCommand } from './store/repositories/commands';

export type { HubParts };

export interface RunningHub {
  readonly submit: (commands: readonly NewCommand[]) => CommandRow[];
  readonly endDeviceEffect: (id: string) => Promise<void>;
  readonly answerOffer: (deviceId: string, sdp: string, clientId: string) => Promise<string>;
  readonly answerTalk: (deviceId: string, sdp: string, clientId: string) => Promise<string>;
  readonly snapshot: (deviceId: string, size: MediaSize) => Promise<Uint8Array>;
  readonly streamReady: (deviceId: string) => Promise<void>;
  readonly runAutomation: (automationId: string) => Promise<void>;
  readonly startSequence: (
    sequenceId: string,
    parameters: Readonly<Record<string, JsonValue>>,
  ) => AutomationRunRow;
  readonly startAutomation: (automationId: string) => Promise<AutomationRunRow>;
  readonly stopAutomationRun: (runId: string) => AutomationRunRow;
  readonly stopAutomationRuns: (automationId: string, controlKey?: string) => void;
  readonly settled: () => Promise<void>;
  readonly local: LocalDevices;
  readonly watches: LocalWatches;
  readonly readings: ScaleReadings;
  readonly drivers: RunningDrivers;
  readonly phones: PhoneNodes;
  readonly signals: SignalBus;
  readonly automationAi: AutomationAiSlot;
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
  if (change.table === 'plugins') {
    return pluginSignalsChanged(change);
  }
  return change.table === 'scenes';
}

function reacting(parts: HubParts, core: Core): (change: RowChange) => void {
  const log = areaOf(parts, 'changes');
  return (change) => {
    if (change.table === 'cameras' && change.record !== null) {
      core.cameras.cameraChanged(change.record);
    }
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
      core.engine.reload().catch(reportFailure(log, 'automations.reload_failed'));
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

function passiveHooks(
  parts: HubParts,
  core: Core,
): Pick<LocalDevicesOptions, 'eligible' | 'sourceChanged'> {
  return {
    eligible: (entry): boolean => {
      const adapter = core.providers.adapterFor('xiaomi');
      const model = entry.config['model'];
      const scope = entry.config['accountScope'];
      const deviceId = entry.config['deviceId'];
      const device = typeof deviceId === 'string' ? parts.store.devices.find(deviceId) : undefined;
      return (
        device?.provider === 'xiaomi' &&
        device.external_id === entry.externalId &&
        device.model === model &&
        adapter instanceof XiaomiAdapter &&
        typeof model === 'string' &&
        typeof scope === 'string' &&
        adapter.passiveEligible(entry.externalId, model, entry.address, scope)
      );
    },
    sourceChanged: (externalId, source): void => {
      const adapter = core.providers.adapterFor('xiaomi');
      if (adapter instanceof XiaomiAdapter) {
        const entry = parts.store.localDevices
          .list()
          .find((candidate) => candidate.externalId === externalId);
        if (source !== null && entry?.config['accountScope'] !== adapter.passiveAccountScope()) {
          return;
        }
        const address = entry?.address ?? null;
        adapter.observePassive(externalId, source, address);
      }
    },
  };
}

function startLocal(parts: HubParts, core: Core): LocalParts {
  const readings = new ScaleReadings({
    store: parts.store,
    log: areaOf(parts, 'scale'),
    now: parts.clock.now,
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
    ...passiveHooks(parts, core),
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
  core: Core,
): Pick<
  RunningHub,
  'runAutomation' | 'startAutomation' | 'stopAutomationRun' | 'stopAutomationRuns' | 'startSequence'
> {
  return {
    runAutomation: (automationId) => core.engine.runNow(automationId),
    startSequence: (id, parameters) => core.sequences.start(id, parameters),
    startAutomation: (automationId) => core.engine.startNow(automationId),
    stopAutomationRun: (runId) => core.runs.stop(runId),
    stopAutomationRuns: (automationId, controlKey): void => {
      core.runs.cancelTarget(automationId, controlKey);
    },
  };
}

function subscribeHubChanges(parts: HubParts, core: Core): () => void {
  const stopChanges = parts.store.feed.subscribe(reacting(parts, core));
  const stopValidation = parts.store.feed.subscribeCommitted(() => {
    core.runs.revalidate();
  });
  return (): void => {
    stopChanges();
    stopValidation();
  };
}

export async function startHub(parts: HubParts): Promise<RunningHub> {
  const core = assemble(parts);
  await core.inventory.load();
  await Promise.all([core.state.load(), core.cameras.load()]);
  await core.cameras.sync(core.inventory.all());
  parts.devicesChanged(core.inventory.all());
  await core.engine.reload();
  const unsubscribe = subscribeHubChanges(parts, core);
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
        void core.executor.run(row);
      }
      return rows;
    },
    answerOffer: (deviceId, sdp, clientId) => core.cameras.answer(deviceId, sdp, clientId),
    answerTalk: (deviceId, sdp, clientId) => core.cameras.talk(deviceId, sdp, clientId),
    snapshot: (deviceId, size) => core.cameras.snapshot(deviceId, size),
    streamReady: (deviceId) => core.cameras.streamReady(deviceId),
    ...automationControls(core),
    settled: (): Promise<void> => flushWrites(core, false),
    local,
    watches,
    readings,
    drivers,
    phones,
    signals: core.signals,
    automationAi: core.automationAi,
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
