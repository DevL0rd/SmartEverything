import type { ToolCaller } from '../../../ai-tools/hub-tool';
import type { Channels } from './channels';
import { DiscordInputError, DiscordPolicyError } from './errors';
import type { DiscordRest } from './link';
import type { EventOrigin, OriginStore } from './origins';
import { RAW_MESSAGE } from './payloads';
import type { Origin, Policy } from './policy';
import type { PluginPeopleView } from '../contract';

export interface Access {
  readonly origin: EventOrigin | null;
}

export interface Reach {
  readonly key: string;
  readonly origin: Origin;
}

export interface AuthorityDeps {
  readonly policy: Policy;
  readonly origins: OriginStore;
  readonly channels: Channels;
  readonly rest: DiscordRest;
  readonly people: PluginPeopleView;
}

export class Authority {
  private readonly policy: Policy;
  private readonly origins: OriginStore;
  private readonly channels: Channels;
  private readonly rest: DiscordRest;
  private readonly people: PluginPeopleView;

  constructor(deps: AuthorityDeps) {
    ({
      policy: this.policy,
      origins: this.origins,
      channels: this.channels,
      rest: this.rest,
      people: this.people,
    } = deps);
  }

  async originOf(eventId: string): Promise<EventOrigin> {
    return this.withSource(await this.checked(eventId));
  }

  async checked(eventId: string): Promise<EventOrigin> {
    const origin = this.origins.get(eventId);
    if (origin === undefined) {
      throw new DiscordInputError('Event unknown or no longer retained');
    }
    if (this.origins.expired(origin)) {
      this.origins.forget(origin.id);
      throw new DiscordInputError('That context has expired; authorize a new one');
    }
    this.policy.assertOrigin(origin);
    if (origin.guildId !== null) {
      const channel = await this.channels.resolve(origin.channelId);
      if (channel.guild_id !== origin.guildId) {
        throw new DiscordPolicyError('Reply guild mismatch');
      }
    }
    return origin;
  }

  assertOwner(caller: ToolCaller): void {
    if (caller.role !== 'owner')
      throw new DiscordPolicyError('Discord is only available to the owner’s own conversations');
  }

  async access(
    caller: ToolCaller,
    eventId: string | undefined,
    mutating: boolean,
  ): Promise<Access> {
    this.assertOwner(caller);
    if (eventId === undefined) {
      return { origin: null };
    }
    const origin = mutating ? await this.originOf(eventId) : await this.checked(eventId);
    if (origin.kind === 'owner') {
      this.policy.assertProactive(origin.channelId);
    }
    return { origin };
  }

  async reach(
    caller: ToolCaller,
    eventId: string | undefined,
    channelId: string | undefined,
  ): Promise<Reach> {
    const { origin } = await this.access(caller, eventId, false);
    if (origin !== null) {
      return { key: origin.id, origin };
    }
    if (channelId === undefined) {
      throw new DiscordInputError('Pass eventId or channelId');
    }
    const owner = this.people.list().find((person) => person.status === 'owner');
    if (owner === undefined) {
      throw new DiscordPolicyError('Mark yourself as owner on the plugin’s People page first');
    }
    const channel = await this.channels.resolve(channelId);
    const synthetic = {
      actorId: owner.external_id,
      channelId,
      guildId: channel.guild_id ?? null,
    };
    this.policy.assertOrigin(synthetic);
    return { key: `channel:${channelId}`, origin: synthetic };
  }

  private async withSource(origin: EventOrigin): Promise<EventOrigin> {
    if (origin.messageId === undefined) {
      return origin;
    }
    const found = await this.rest
      .get(`/channels/${origin.channelId}/messages/${origin.messageId}`)
      .catch(() => null);
    const source = RAW_MESSAGE.safeParse(found);
    if (
      source.success &&
      source.data.id === origin.messageId &&
      source.data.channel_id === origin.channelId
    ) {
      return origin;
    }
    const { messageId: _gone, ...detached } = origin;
    return detached;
  }
}
