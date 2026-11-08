import { commandPorts } from './plugin-device-command';
import type { CommandRow } from '@smarteverything/domain';
import type { NewCommand } from '../store/repositories/commands';
import type { HealthRecord, PluginManifest, SignalInput } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { HubLayout } from '../data-layout';
import type { ToolCaller } from '../ai-tools/hub-tool';
import type { Store } from '../store/store';
import type {
  PluginConfiguration,
  PluginFiles,
  PluginHostContext,
  PluginPeopleView,
  PluginRecords,
  PluginTool,
  Unsubscribe,
} from './builtin/contract';
import { metricsOf, viewersOf, type DriverServices } from './driver-services';
import { networkOf } from './plugin-listen';
import { pluginFiles, type PluginConversations } from './plugin-assistant';
import type { PluginPeople } from './plugin-people';
import type { PluginSpeakers } from './plugin-speakers';
import { voiceOf, type PluginVoiceServices } from './plugin-voice';
import type { PluginSecrets } from './plugin-secrets';
import type { ContributionSinks } from './runtime';
import { presenceSignal } from '../automations/world-v3/presence';
import { pluginLogger } from './plugin-logs';

export interface BuiltinContextOptions {
  readonly store: Store;
  readonly secrets: PluginSecrets;
  readonly drivers: DriverServices;
  readonly people: PluginPeople;
  readonly speakers: PluginSpeakers;
  readonly voice: PluginVoiceServices;
  readonly conversations: Pick<PluginConversations, 'forPlugin'>;
  readonly attachments: (chatId: string) => readonly string[];
  readonly machineFile: PluginFiles['fromMachine'];
  readonly uploadFile: PluginFiles['fromUpload'];
  readonly pictureFile: PluginFiles['fromPicture'];
  readonly layout: HubLayout;
  readonly configure: (
    pluginId: string,
    change: Partial<PluginConfiguration>,
    by?: ToolCaller,
  ) => Promise<void>;
  readonly submit: (commands: readonly NewCommand[]) => CommandRow[];
  readonly signals: { readonly emit: (signal: SignalInput) => void };
  readonly now: () => Date;
  readonly log: Logger;
}

export interface BuiltinSession {
  readonly manifest: PluginManifest;
  readonly signal: AbortSignal;
  readonly sinks: ContributionSinks;
  readonly tools: (tools: readonly PluginTool[]) => void;
  readonly track: (stop: Unsubscribe) => Unsubscribe;
  readonly watchSettings: PluginHostContext['watchSettings'];
  readonly options: PluginHostContext['options']['register'];
}

function recordsOf(store: Store, id: string, collection: string): PluginRecords {
  return {
    get: (key) => store.pluginData.record(id, collection, key),
    list: () => store.pluginData.records(id, collection),
    put: (key, value): void => {
      store.pluginData.putRecord(id, collection, key, value);
    },
    remove: (key): void => {
      store.pluginData.removeRecord(id, collection, key);
    },
  };
}

function healthWriter(store: Store, manifest: PluginManifest): PluginHostContext['health'] {
  const sourceApp = `smarteverything.plugin.${manifest.id}`;
  const source = { device: manifest.name, appVersion: manifest.version };
  return {
    write: (profileId, records: readonly HealthRecord[]): Promise<void> => {
      store.profiles.byId(profileId);
      store.health.ingest(
        {
          records: records.map((record) => ({ ...record, sourceApp })),
          deletions: [],
          grantedTypes: [],
          source,
        },
        profileId,
      );
      return Promise.resolve();
    },
  };
}

function peopleOf(
  people: PluginPeople,
  pluginId: string,
  track: BuiltinSession['track'],
): PluginPeopleView {
  return {
    save: (externalId, change) => people.set(pluginId, externalId, change),
    find: (externalId) => people.find(pluginId, externalId) ?? null,
    list: () => people.list(pluginId),
    requesterOf: (externalId) => people.requesterOf(pluginId, externalId),
    watch: (listener) => track(people.watch(pluginId, listener)),
  };
}

function clientsOf(
  store: BuiltinContextOptions['store'],
  track: BuiltinSession['track'],
): PluginHostContext['clients'] {
  return {
    gone: (listener): Unsubscribe =>
      track(
        store.feed.subscribe((change) => {
          if (change.table !== 'clients' || change.operation !== 'DELETE') return;
          if (change.oldRecord !== null) listener(change.oldRecord.id);
        }),
      ),
  };
}

function secretsOf(options: BuiltinContextOptions, id: string): PluginHostContext['secrets'] {
  return {
    get: (name) => options.secrets.get(id, name),
    set: (name, value) => options.secrets.set(id, { [name]: value }),
    remove: (name) => options.secrets.remove(id, name),
  };
}

function devicesOf(
  options: BuiltinContextOptions,
  session: BuiltinSession,
  ownDrivers: Set<string>,
): PluginHostContext['devices'] {
  const { command, withTransientValues } = commandPorts(options, session, ownDrivers);
  return {
    command,
    register: (driver): Unsubscribe => {
      const stop = options.drivers.registry.register(withTransientValues(driver));
      ownDrivers.add(driver.id);
      return session.track((): void => {
        ownDrivers.delete(driver.id);
        stop();
      });
    },
  };
}

function homeOf(
  store: Store,
  signals: BuiltinContextOptions['signals'],
): PluginHostContext['home'] {
  return {
    timeZone: (): string => store.settings.read().time_zone,
    profiles: () => store.profiles.list().map(({ id, name }) => ({ id, name })),
    phone: (profileId): { readonly paired: boolean; readonly place: string | null } => {
      const entry = store.phoneContexts.latestOf(profileId);
      return { paired: entry !== undefined, place: entry?.place ?? null };
    },
    presenceChanged: (move): void => {
      signals.emit(presenceSignal(move));
    },
  };
}

export function builtinContext(
  options: BuiltinContextOptions,
  session: BuiltinSession,
): PluginHostContext {
  const id = session.manifest.id;
  const log = pluginLogger(options.log, id);
  const { sinks, track } = session;
  const ownDrivers = new Set<string>();
  return {
    manifest: session.manifest,
    secrets: secretsOf(options, id),
    signal: session.signal,
    log,
    tools: { register: session.tools },
    devices: devicesOf(options, session, ownDrivers),
    data: {
      publish: (stream, value): void => {
        sinks.data({ stream, value, at: options.now().toISOString() });
      },
    },
    events: { emit: sinks.event },
    options: { register: session.options },
    search: { replace: sinks.search },
    health: healthWriter(options.store, session.manifest),
    records: (collection) => recordsOf(options.store, id, collection),
    configure: (change, by) => options.configure(id, change, by),
    watchSettings: session.watchSettings,
    viewers: viewersOf(options.store, options.drivers, track),
    clients: clientsOf(options.store, track),
    metrics: metricsOf(options.drivers, (externalId) => {
      log.warn('plugin.metric_without_device', { externalId });
    }),
    messages: { post: sinks.message },
    people: peopleOf(options.people, id, track),
    reach: { register: (speaker) => track(options.speakers.register(id, speaker, ownDrivers)) },
    network: networkOf(track),
    voice: voiceOf(options.voice, { pluginId: id, track }, session.manifest.permissions.voice),
    assistant: options.conversations.forPlugin(id),
    files: pluginFiles(options.layout.system.plugins(id), {
      attachmentsOf: options.attachments,
      fromMachine: options.machineFile,
      fromUpload: options.uploadFile,
      fromPicture: options.pictureFile,
    }),
    home: homeOf(options.store, options.signals),
  };
}
