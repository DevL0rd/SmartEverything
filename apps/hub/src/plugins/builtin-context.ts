import type { HealthRecord, PluginManifest } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import type {
  PluginConfiguration,
  PluginHostContext,
  PluginRecords,
  PluginTool,
  Unsubscribe,
} from './builtin/contract';
import { metricsOf, viewersOf, type DriverServices } from './driver-services';
import type { PluginSecrets } from './plugin-secrets';
import type { ContributionSinks } from './runtime';

export interface BuiltinContextOptions {
  readonly store: Store;
  readonly secrets: PluginSecrets;
  readonly drivers: DriverServices;
  readonly configure: (pluginId: string, change: Partial<PluginConfiguration>) => Promise<void>;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface BuiltinSession {
  readonly manifest: PluginManifest;
  readonly signal: AbortSignal;
  readonly sinks: ContributionSinks;
  readonly tools: (tools: readonly PluginTool[]) => void;
  readonly track: (stop: Unsubscribe) => Unsubscribe;
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

function secretsOf(options: BuiltinContextOptions, id: string): PluginHostContext['secrets'] {
  return {
    get: (name) => options.secrets.get(id, name),
    set: (name, value) => options.secrets.set(id, { [name]: value }),
    remove: (name) => options.secrets.remove(id, name),
  };
}

export function builtinContext(
  options: BuiltinContextOptions,
  session: BuiltinSession,
): PluginHostContext {
  const id = session.manifest.id;
  const log = options.log.child({ actorId: `plugin:${id}` });
  const { sinks, track } = session;
  return {
    manifest: session.manifest,
    secrets: secretsOf(options, id),
    signal: session.signal,
    log,
    tools: { register: session.tools },
    devices: { register: (driver) => track(options.drivers.registry.register(driver)) },
    data: {
      publish: (stream, value): void => {
        sinks.data({ stream, value, at: options.now().toISOString() });
      },
    },
    events: { emit: sinks.event },
    search: { replace: sinks.search },
    health: healthWriter(options.store, session.manifest),
    records: (collection) => recordsOf(options.store, id, collection),
    configure: (change) => options.configure(id, change),
    viewers: viewersOf(options.store, options.drivers, track),
    metrics: metricsOf(options.drivers, (externalId) => {
      log.warn('plugin.metric_without_device', { externalId });
    }),
  };
}
