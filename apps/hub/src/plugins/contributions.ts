import {
  pluginSignalSource,
  pluginSignalSpec,
  type InboundMessage,
  type PluginManifest,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { SignalBus } from '../signals/bus';
import type { Store } from '../store/store';
import type { ContributionSinks } from './runtime';

const LIVE_SAVE_EVERY_MS = 60_000;

export interface ContributionOptions {
  readonly store: Store;
  readonly signals: Pick<SignalBus, 'emit' | 'register'>;
  readonly inbound: (pluginId: string, message: InboundMessage) => void;
  readonly now: () => Date;
}

export interface Contributions {
  readonly sinks: ContributionSinks;
  readonly stop: () => void;
}

function eventSink(
  options: ContributionOptions,
  manifest: PluginManifest,
  log: (line: string) => void,
): ContributionSinks['event'] {
  const source = pluginSignalSource(manifest.id);
  const { events } = manifest.contributes;
  return (event): void => {
    if (!events.some((declared) => declared.kind === event.kind)) {
      log(`Ignored the ${event.kind} event: the manifest does not declare it`);
      return;
    }
    options.signals.emit({
      source,
      kind: event.kind,
      subject: event.subject,
      field: null,
      value: true,
      previous: null,
      at: options.now().toISOString(),
      profileId: null,
      data: event.data,
    });
  };
}

function dataSink(
  options: ContributionOptions,
  manifest: PluginManifest,
  log: (line: string) => void,
): ContributionSinks['data'] {
  const { store } = options;
  const id = manifest.id;
  const { data } = manifest.contributes;
  return (point): void => {
    const stream = data.find((declared) => declared.stream === point.stream);
    if (stream === undefined) {
      log(`Ignored data for ${point.stream}: the manifest does not declare that stream`);
      return;
    }
    if (stream.live) store.live.pluginStreams.publish(id, point);
    else
      background(
        store.host.call('pluginData', 'publish', id, point, stream.history),
        'plugin.data_save_failed',
        { pluginId: id, stream: point.stream },
      );
  };
}

function viewerDataSink(
  options: ContributionOptions,
  manifest: PluginManifest,
  log: (line: string) => void,
): ContributionSinks['viewerData'] {
  const id = manifest.id;
  const { data } = manifest.contributes;
  return (point, deviceId): void => {
    const stream = data.find((declared) => declared.stream === point.stream);
    if (stream?.live !== true) {
      log(
        `Ignored viewer data for ${point.stream}: the manifest does not declare it as a live stream`,
      );
      return;
    }
    options.store.live.pluginStreams.publishToViewers(id, point, deviceId);
  };
}

export function contributionsOf(
  options: ContributionOptions,
  manifest: PluginManifest,
  log: (line: string) => void,
): Contributions {
  const id = manifest.id;
  const { data, events } = manifest.contributes;
  const unregister =
    events.length > 0 ? options.signals.register(pluginSignalSpec(manifest)) : null;
  const { store } = options;
  const saveLive = (stopping: boolean): void => {
    background(store.live.pluginStreams.save(id, stopping), 'plugin.live_save_failed', {
      pluginId: id,
    });
  };
  const saver = data.some((stream) => stream.live)
    ? setInterval(() => {
        saveLive(false);
      }, LIVE_SAVE_EVERY_MS)
    : null;
  saver?.unref();
  return {
    sinks: {
      message: (message): void => {
        if (!manifest.permissions.inbound) {
          log(`Ignored a chat message: ${manifest.name} may not post into chats`);
          return;
        }
        options.inbound(id, message);
      },
      data: dataSink(options, manifest, log),
      viewerData: viewerDataSink(options, manifest, log),
      event: eventSink(options, manifest, log),
      search: (entries): void => {
        background(
          store.host.call('pluginData', 'replaceSearch', id, entries),
          'plugin.search_save_failed',
          { pluginId: id },
        );
      },
    },
    stop: (): void => {
      unregister?.();
      if (saver === null) return;
      clearInterval(saver);
      saveLive(true);
    },
  };
}
