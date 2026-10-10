import { z } from 'zod';
import type { CommandSet } from './commands';
import type { Controls } from './controls';
import type { GatewayPacket } from './link';
import type { Intake } from './intake';
import { botNamesOf } from './observation';
import {
  GUILD_CREATE,
  GUILD_MEMBER_REMOVE,
  GUILD_MEMBER_UPDATE,
  MESSAGE_DELETE,
  MESSAGE_DELETE_BULK,
  RAW_CHANNEL,
  RAW_INTERACTION,
  RAW_MESSAGE,
  READY,
} from './payloads';
import { rawPerson } from './person';
import type { DiscordServices } from './services';
import type { Status } from './status';
import type { VoiceEvents } from './voice/events';

const APPLICATION = z.looseObject({ name: z.string().nullish() });
const OWN_MEMBER = z.looseObject({ nick: z.string().nullish() });
const GUILD_DELETE = z.looseObject({ id: z.string(), unavailable: z.boolean().optional() });

export interface GatewayDeps {
  readonly services: DiscordServices;
  readonly intake: Intake;
  readonly controls: Controls;
  readonly commands: readonly CommandSet[];
  readonly status: Status;
  readonly voice: VoiceEvents;
  readonly guilds: Set<string>;
  readonly guildNames: Map<string, string>;
  readonly report: (cause: unknown) => void;
}

export class Gateway {
  private application: string | null = null;
  private globalName: string | null = null;
  private username: string | null = null;
  private readonly nicknames = new Map<string, string | null>();

  constructor(private readonly deps: GatewayDeps) {}

  packet(packet: GatewayPacket): void {
    try {
      this.handlers[packet.t]?.(packet.d);
    } catch (cause) {
      this.deps.report(cause);
    }
  }

  private guard(work: Promise<unknown>): void {
    work.catch(this.deps.report);
  }

  private readonly channelNoted = (data: unknown): void => {
    this.deps.services.channels.note(RAW_CHANNEL.parse(data));
  };

  private readonly handlers: Readonly<Record<string, (data: unknown) => void>> = {
    READY: (data) => {
      this.guard(this.ready(READY.parse(data)));
    },
    GUILD_CREATE: (data) => {
      this.guildCreated(GUILD_CREATE.parse(data), data);
    },
    GUILD_DELETE: (data) => {
      this.guildGone(GUILD_DELETE.parse(data));
    },
    CHANNEL_CREATE: this.channelNoted,
    CHANNEL_UPDATE: this.channelNoted,
    THREAD_CREATE: this.channelNoted,
    THREAD_UPDATE: this.channelNoted,
    MESSAGE_CREATE: (data) => {
      this.guard(this.deps.intake.message(RAW_MESSAGE.parse(data)));
    },
    MESSAGE_UPDATE: (data) => {
      this.deps.intake.edited(data);
    },
    MESSAGE_DELETE: (data) => {
      this.deps.intake.removed([MESSAGE_DELETE.parse(data).id]);
    },
    MESSAGE_DELETE_BULK: (data) => {
      this.deps.intake.removed(MESSAGE_DELETE_BULK.parse(data).ids);
    },
    GUILD_MEMBER_UPDATE: (data) => {
      this.memberUpdated(GUILD_MEMBER_UPDATE.parse(data));
    },
    GUILD_MEMBER_REMOVE: (data) => {
      const gone = GUILD_MEMBER_REMOVE.parse(data);
      this.deps.services.policy.noteRoles(gone.user.id, gone.guild_id, []);
    },
    VOICE_STATE_UPDATE: (data) => {
      this.deps.voice.stateUpdated(data);
    },
    VOICE_SERVER_UPDATE: (data) => {
      this.deps.voice.serverUpdated(data);
    },
    INTERACTION_CREATE: (data) => {
      this.guard(this.deps.controls.interaction(RAW_INTERACTION.parse(data)));
    },
  };

  private guildCreated(guild: z.output<typeof GUILD_CREATE>, raw: unknown): void {
    const { services, guilds, guildNames, status } = this.deps;
    guilds.add(guild.id);
    const named = z.looseObject({ name: z.string().optional() }).safeParse(raw);
    if (named.success && named.data.name !== undefined) {
      guildNames.set(guild.id, named.data.name);
    }
    for (const channel of [...guild.channels, ...guild.threads]) {
      services.channels.note({ ...channel, guild_id: guild.id });
    }
    status.guilds(guilds.size);
    this.deps.voice.guildCreated(raw);
    this.guard(this.nameGuild(guild.id));
  }

  private guildGone(gone: z.output<typeof GUILD_DELETE>): void {
    if (gone.unavailable !== true) {
      this.deps.guilds.delete(gone.id);
      this.deps.guildNames.delete(gone.id);
      this.deps.voice.guildGone(gone.id);
      this.nicknames.delete(gone.id);
      this.deps.status.guilds(this.deps.guilds.size);
    }
  }

  private memberUpdated(update: z.output<typeof GUILD_MEMBER_UPDATE>): void {
    const { services } = this.deps;
    services.policy.noteRoles(update.user.id, update.guild_id, update.roles);
    services.directory.learnVisible(rawPerson(update.user, update), update.guild_id, true);
    if (update.user.id === services.identity.botId) {
      this.nicknames.set(update.guild_id, update.nick ?? null);
      this.applyNames();
    }
  }

  private applyNames(): void {
    this.deps.services.policy.botNames = botNamesOf({
      application: this.application,
      nicknames: [...this.nicknames.values()],
      globalName: this.globalName,
      username: this.username,
    });
    this.deps.status.identified(
      this.deps.services.identity.botId,
      this.application ?? this.globalName ?? this.username,
    );
  }

  private async nameGuild(guildId: string): Promise<void> {
    const { botId } = this.deps.services.identity;
    const found = OWN_MEMBER.safeParse(
      await this.deps.services.rest.get(`/guilds/${guildId}/members/${botId}`),
    );
    this.nicknames.set(guildId, found.success ? (found.data.nick ?? null) : null);
    this.applyNames();
  }

  private async ready(ready: z.output<typeof READY>): Promise<void> {
    const { services, guilds, status, commands } = this.deps;
    services.identity.botId = ready.user.id;
    services.identity.applicationId = ready.application.id;
    this.username = ready.user.username ?? null;
    this.globalName = ready.user.global_name ?? null;
    for (const guild of ready.guilds) {
      guilds.add(guild.id);
    }
    status.guilds(guilds.size);
    status.link('ready', null);
    this.applyNames();
    const app = APPLICATION.safeParse(await services.rest.get('/applications/@me'));
    this.application = app.success ? (app.data.name ?? null) : null;
    this.applyNames();
    await services.rest.put(
      `/applications/${ready.application.id}/commands`,
      commands.map((set) => set.definition),
    );
  }
}
