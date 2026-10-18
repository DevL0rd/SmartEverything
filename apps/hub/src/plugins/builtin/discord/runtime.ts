import { discordSpeechReader } from './voice/speech-reader';
import type { InboundMessage } from '@smarteverything/domain';
import { MissingSecretError } from '../../placeholders';
import type { PluginContext, PluginStop } from '../contract';
import { assemble, type Assembled } from './assembly';
import { builtInCommands } from './commands';
import { Controls } from './controls';
import { Gateway } from './gateway';
import { PICKER_SOURCES, discordPicker, type PickerWorld } from './pickers';
import { History } from './history';
import { Intake } from './intake';
import { INTENTS, type DiscordLink, type DiscordLinkFactory } from './link';
import type { DiscordServices } from './services';
import type { Downloader } from './media-download';
import { TOKEN_SECRET, type DiscordSettings } from './settings';
import { Status } from './status';
import { discordTools } from './tools';
import { Triggers } from './triggers';
import { Typing } from './typing';
import { assembleVoice } from './voice/assembly';
import type { VoiceBackend } from './voice/link';
import { messageOf } from '@smarteverything/logging';

export interface DiscordEnvironment {
  readonly connect: DiscordLinkFactory;
  readonly download: Downloader;
  readonly voice: () => VoiceBackend;
}

type Context = PluginContext<DiscordSettings>;

function intentsOf(settings: DiscordSettings): number {
  return (
    INTENTS.guilds |
    INTENTS.guildMessages |
    INTENTS.directMessages |
    INTENTS.guildVoiceStates |
    (settings.message_content_intent ? INTENTS.messageContent : 0) |
    (settings.guild_members_intent ? INTENTS.guildMembers : 0)
  );
}

interface Wired {
  readonly gateway: Gateway;
  readonly typing: Typing;
  readonly status: Status;
  readonly services: DiscordServices;
  readonly voice: ReturnType<typeof assembleVoice>;
  readonly guildNames: ReadonlyMap<string, string>;
}

interface Shared {
  readonly ctx: Context;
  readonly environment: DiscordEnvironment;
  readonly report: (cause: unknown) => void;
  readonly post: (message: InboundMessage) => void;
  readonly refused: (cause: unknown) => void;
}

function historyOf(shared: Shared, services: DiscordServices): History {
  const { settings } = shared.ctx;
  return new History({
    rest: services.rest,
    policy: services.policy,
    channels: services.channels,
    context: services.context,
    settings: {
      reach: settings.context_reach,
      enabled: settings.context_enabled,
      perChannel: settings.context_per_channel,
      contentIntent: settings.message_content_intent,
    },
    reuseMinutes: () => shared.ctx.assistant.settings().reuseChatMinutes,
    now: Date.now,
    report: shared.report,
  });
}

interface Base {
  readonly assembled: Assembled;
  readonly status: Status;
  readonly typing: Typing;
  readonly guilds: Set<string>;
  readonly guildNames: Map<string, string>;
  readonly voice: ReturnType<typeof assembleVoice>;
}

function baseOf(shared: Shared, link: DiscordLink): Base {
  const { ctx, environment, report, post } = shared;
  const assembled = assemble(ctx, link.rest, environment.download, report);
  const status = new Status(ctx.data.publish, () => new Date());
  const typing = new Typing(Date.now, report);
  const guildNames = new Map<string, string>();
  const voice = assembleVoice({
    ctx,
    services: assembled.services,
    link,
    voice: environment.voice(),
    typing,
    status,
    guildNames,
    post,
    report,
  });
  return { assembled, status, typing, guilds: new Set<string>(), guildNames, voice };
}

function gatewayOf(shared: Shared, base: Base): Gateway {
  const { ctx, report, post } = shared;
  const { services, interactions, mediaIndex } = base.assembled;
  const { status, typing, guilds, guildNames, voice } = base;
  const commands = [...builtInCommands(ctx.assistant, services.activity), ...voice.commands];
  const intake = new Intake({
    services,
    triggers: new Triggers(services.policy),
    history: historyOf(shared, services),
    mediaIndex,
    typing,
    calls: voice.service,
    status,
    guilds,
    guildNames,
    post,
    report,
  });
  const controls = new Controls({
    services,
    interactions,
    commands: new Map(commands.map((set) => [set.name, set])),
    calls: voice.service,
    guildNames,
    typing,
    post,
    report,
    refused: shared.refused,
  });
  return new Gateway({
    services,
    intake,
    controls,
    commands,
    status,
    voice: voice.events,
    guilds,
    guildNames,
    report,
  });
}

function wire(shared: Shared, link: DiscordLink): Wired {
  const base = baseOf(shared, link);
  return {
    gateway: gatewayOf(shared, base),
    typing: base.typing,
    status: base.status,
    services: base.assembled.services,
    voice: base.voice,
    guildNames: base.guildNames,
  };
}

function register(ctx: Context, wired: Wired): void {
  const { typing, status, services, voice } = wired;
  ctx.voice.transcripts.speechReader(discordSpeechReader(services, ctx.voice.transcripts));
  ctx.tools.register([
    ...discordTools(
      services,
      status,
      {
        answered: (eventId) => {
          typing.stop(eventId);
          services.sender.forgetTyping(eventId);
        },
      },
      voice.tools,
    ),
  ]);
}

function pickersOf(ctx: Context): { readonly set: (world: PickerWorld) => void } {
  let current: PickerWorld | null = null;
  PICKER_SOURCES.forEach((source) => {
    ctx.options.register(
      source,
      discordPicker(source, () => current),
    );
  });
  return {
    set: (world): void => {
      current = world;
    },
  };
}

export async function startDiscord(
  ctx: Context,
  environment: DiscordEnvironment,
): Promise<PluginStop> {
  const world = pickersOf(ctx);
  const token = ctx.secrets.get(TOKEN_SECRET);
  if (token === null) {
    throw new MissingSecretError(TOKEN_SECRET, 'Bot token');
  }
  const report = (cause: unknown): void => {
    ctx.log.error('discord.handler_failed', cause);
  };
  const link = environment.connect({ token, intents: intentsOf(ctx.settings) });
  const post = (message: InboundMessage): void => {
    ctx.messages.post(message);
  };
  const refused = (cause: unknown): void => {
    ctx.log.warn('discord.control_refused', {
      reason: messageOf(cause),
    });
  };
  const wired = wire({ ctx, environment, report, post, refused }, link);
  const { gateway, typing, status, voice } = wired;
  register(ctx, wired);
  world.set({
    rest: link.rest,
    guilds: (): ReadonlyMap<string, string> => wired.guildNames,
    ready: (): boolean => status.view().gateway === 'ready',
  });
  status.link('connecting', null);
  await link.connect({
    packet: (packet) => {
      gateway.packet(packet);
    },
    state: (state, detail) => {
      status.link(state, detail);
      if (state === 'error') {
        ctx.log.error('discord.link_failed', new Error(detail ?? 'The Discord connection failed'));
      }
    },
  });
  return async (): Promise<void> => {
    typing.close();
    await voice.service.stop();
    await link.close();
    status.link('offline', null);
  };
}
