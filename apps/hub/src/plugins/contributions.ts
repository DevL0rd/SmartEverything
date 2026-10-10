import {
  pluginSignalSource,
  pluginSignalSpec,
  type InboundMessage,
  type PluginManifest,
} from '@smarteverything/domain';
import type { SignalBus } from '../signals/bus';
import type { Store } from '../store/store';
import type { ContributionSinks } from './runtime';

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

export function contributionsOf(
  options: ContributionOptions,
  manifest: PluginManifest,
  log: (line: string) => void,
): Contributions {
  const id = manifest.id;
  const { data, events } = manifest.contributes;
  const unregister =
    events.length > 0 ? options.signals.register(pluginSignalSpec(manifest)) : null;
  return {
    sinks: {
      message: (message): void => {
        if (!manifest.permissions.inbound) {
          log(`Ignored a chat message: ${manifest.name} may not post into chats`);
          return;
        }
        options.inbound(id, message);
      },
      data: (point): void => {
        const stream = data.find((declared) => declared.stream === point.stream);
        if (stream === undefined) {
          log(`Ignored data for ${point.stream}: the manifest does not declare that stream`);
          return;
        }
        options.store.pluginData.publish(id, point, stream.history);
      },
      event: eventSink(options, manifest, log),
      search: (entries): void => {
        options.store.pluginData.replaceSearch(id, entries);
      },
    },
    stop: (): void => {
      unregister?.();
    },
  };
}
