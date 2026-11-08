import type { Server } from 'node:http';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { RunningExtension } from '../extensions';
import { deviceTarget } from '../metrics/viewers';
import { BUILTIN_PLUGINS } from '../plugins/builtin';
import type { Catalogue } from '../openrouter/catalogue';
import { PluginHost } from '../plugins/host';
import { followPluginKinds } from '../automations/plugin-kinds/contributions';
import { machineFileReader } from '../plugins/machine-file';
import { uploadFileReader } from '../plugins/upload-file';
import { pictureFileReader } from '../plugins/picture-file';
import { recordingPathIn } from '../services';
import type { PluginFiles } from '../plugins/builtin/contract';
import { PluginConversations, chatAttachmentPaths } from '../plugins/plugin-assistant';
import type { PluginVoiceServices } from '../plugins/plugin-voice';
import { portNeedsOf } from '../plugins/plugin-listen';
import { PluginPeople } from '../plugins/plugin-people';
import type { PluginSpeakers } from '../plugins/plugin-speakers';
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
  readonly people: PluginPeople;
  readonly speakers: PluginSpeakers;
  readonly voice: PluginVoiceServices;
  readonly conversations: PluginConversations;
  readonly attachments: (chatId: string) => readonly string[];
  readonly machineFile: PluginFiles['fromMachine'];
  readonly uploadFile: PluginFiles['fromUpload'];
  readonly pictureFile: PluginFiles['fromPicture'];
}

function hostOf(options: BuildOptions, links: HostLinks): PluginHost {
  return new PluginHost({
    store: options.store,
    secrets: links.secrets,
    builtins: BUILTIN_PLUGINS,
    builtin: {
      drivers: { ...options.core.hub.drivers, target: deviceTarget },
      people: links.people,
      speakers: links.speakers,
      voice: links.voice,
      conversations: links.conversations,
      attachments: links.attachments,
      machineFile: links.machineFile,
      uploadFile: links.uploadFile,
      pictureFile: links.pictureFile,
      layout: options.layout,
      submit: options.core.hub.submit,
      signals: options.core.hub.signals,
      now: options.clock.now,
    },
    contributions: {
      signals: options.core.hub.signals,
      inbound: (pluginId, message): void => {
        links.inbox().receive(pluginId, message);
      },
      now: options.clock.now,
    },
    configure: (pluginId, change, by) => links.admin().configure(pluginId, change, by),
    layout: options.layout,
    mcpUrl: () => localUrlOf(links.listening),
    now: options.clock.now,
    log: options.log.forArea('hub.plugins'),
  });
}

function extensionOf(stop: () => Promise<void>): RunningExtension {
  return { endpoints: {}, routes: [], stop };
}

function adminOf(
  options: BuildOptions,
  parts: {
    readonly host: PluginHost;
    readonly inbox: PluginInbox;
    readonly secrets: PluginSecrets;
    readonly people: PluginPeople;
  },
): PluginAdmin {
  const { host, inbox, secrets, people } = parts;
  return new PluginAdmin({
    store: options.store,
    secrets,
    host: (): PluginHost => host,
    inbox: (): PluginInbox => inbox,
    people,
    validate: (row, settings): string | null => host.validate(row, settings),
    fetch: options.fetch,
  });
}

function followPorts(options: BuildOptions, context: ServerContext, host: PluginHost): () => void {
  const sync = (): void => {
    context.firewall.pluginsChanged(portNeedsOf(options.store.plugins.list()));
  };
  sync();
  return host.changes(sync);
}

function followKinds(options: BuildOptions, context: ServerContext, host: PluginHost): () => void {
  return followPluginKinds(
    context.hub.automationKinds,
    {
      plugins: () => options.store.plugins.list(),
      loaded: (pluginId) => host.slot(pluginId) !== undefined,
      changes: (listener) => host.changes(listener),
    },
    (pluginId, detail) => {
      options.store.plugins.update(pluginId, { statusDetail: detail });
    },
  );
}

function inboxOf(options: BuildOptions, context: ServerContext, host: PluginHost): PluginInbox {
  return new PluginInbox({
    store: options.store,
    assistant: context.assistant,
    host: (): PluginHost => host,
    fetch: options.fetch,
    tmp: options.layout.tmp,
    now: options.clock.now,
    log: options.log.forArea('hub.plugins'),
  });
}

export interface PluginLinks {
  readonly speakers: PluginSpeakers;
  readonly voice: PluginVoiceServices;
}

function fileReadersOf(
  options: BuildOptions,
  context: ServerContext,
  tools: ToolHub,
): Pick<HostLinks, 'attachments' | 'machineFile' | 'uploadFile' | 'pictureFile'> {
  return {
    attachments: (chatId) => chatAttachmentPaths(options.store, context.assistant.files, chatId),
    machineFile: machineFileReader({ tools, harness: context.harness }),
    uploadFile: uploadFileReader({ store: options.store, files: context.assistant.files }),
    pictureFile: pictureFileReader({
      store: options.store,
      recordingPath: recordingPathIn(options.layout),
      attachmentPath: (file) => context.assistant.files.pathOf(file),
    }),
  };
}

export function wirePlugins(
  options: BuildOptions,
  context: ServerContext,
  tools: ToolHub,
  links: PluginLinks,
): Plugins {
  const secrets = new PluginSecrets(options.secrets);
  const people = new PluginPeople(options.store);
  const conversations = new PluginConversations({
    store: options.store,
    assistant: context.assistant,
    catalogue: (): Catalogue => context.openRouter.catalogue,
    now: options.clock.now,
  });
  const listening: Listening = { server: null };
  const host: PluginHost = hostOf(options, {
    admin: () => admin,
    inbox: () => inbox,
    listening,
    secrets,
    people,
    ...links,
    conversations,
    ...fileReadersOf(options, context, tools),
  });
  const inbox = inboxOf(options, context, host);
  const admin = adminOf(options, { host, inbox, secrets, people });
  const removeSource = tools.add(pluginToolSource(host));
  const unfollowPorts = followPorts(options, context, host);
  const unfollowKinds = followKinds(options, context, host);
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
      unfollowPorts();
      unfollowKinds();
      inbox.stop();
      await host.shutdown();
    }),
  };
}
