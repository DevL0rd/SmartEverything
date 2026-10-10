import type { Server } from 'node:http';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { RunningExtension } from '../extensions';
import { deviceTarget } from '../metrics/viewers';
import { BUILTIN_PLUGINS } from '../plugins/builtin';
import { PluginHost } from '../plugins/host';
import { PluginInbox } from '../plugins/inbound';
import { PluginAdmin } from '../plugins/plugin-admin';
import { PluginSecrets } from '../plugins/plugin-secrets';
import { pluginToolSource } from '../plugins/plugin-tools';
import { localUrlOf, type Listening } from './assistant-wiring';
import type { BuildOptions } from './build';
import type { ServerContext } from './context';

export interface Plugins {
  readonly admin: PluginAdmin;
  readonly boot: (http: Server) => void;
  readonly extension: RunningExtension;
}

interface HostLinks {
  readonly admin: () => PluginAdmin;
  readonly inbox: () => PluginInbox;
  readonly listening: Listening;
  readonly secrets: PluginSecrets;
}

function hostOf(options: BuildOptions, links: HostLinks): PluginHost {
  return new PluginHost({
    store: options.store,
    secrets: links.secrets,
    builtins: BUILTIN_PLUGINS,
    builtin: {
      drivers: { ...options.core.hub.drivers, target: deviceTarget },
      now: options.clock.now,
    },
    contributions: {
      signals: options.core.hub.signals,
      inbound: (pluginId, message): void => {
        links.inbox().receive(pluginId, message);
      },
      now: options.clock.now,
    },
    configure: (pluginId, change) => links.admin().configure(pluginId, change),
    dataDirectory: options.dataDirectory,
    mcpUrl: () => localUrlOf(links.listening),
    now: options.clock.now,
    log: options.log.forArea('hub.plugins'),
  });
}

function extensionOf(stop: () => Promise<void>): RunningExtension {
  return { endpoints: {}, routes: [], stop };
}

export function wirePlugins(
  options: BuildOptions,
  context: ServerContext,
  tools: ToolHub,
): Plugins {
  const secrets = new PluginSecrets(options.secrets);
  const listening: Listening = { server: null };
  const host: PluginHost = hostOf(options, {
    admin: () => admin,
    inbox: () => inbox,
    listening,
    secrets,
  });
  const inbox = new PluginInbox({
    store: options.store,
    assistant: context.assistant,
    host: (): PluginHost => host,
    fetch: options.fetch,
    now: options.clock.now,
    log: options.log.forArea('hub.plugins'),
  });
  const admin = new PluginAdmin({
    store: options.store,
    secrets,
    host: (): PluginHost => host,
    inbox: (): PluginInbox => inbox,
    validate: (row, settings): string | null => host.validate(row, settings),
    fetch: options.fetch,
  });
  const removeSource = tools.add(pluginToolSource(host));
  return {
    admin,
    boot: (http): void => {
      listening.server = http;
      http.once('listening', () => {
        host.boot().catch((cause: unknown) => {
          context.log.error('plugins.boot_failed', cause);
        });
      });
    },
    extension: extensionOf(async (): Promise<void> => {
      removeSource();
      inbox.stop();
      await host.shutdown();
    }),
  };
}
