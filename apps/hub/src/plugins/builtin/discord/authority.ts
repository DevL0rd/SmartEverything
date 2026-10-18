import type { ToolCaller } from '../../../ai-tools/hub-tool';
import type { Channels } from './channels';
import { DiscordInputError, DiscordPolicyError } from './errors';
import type { EventOrigin, OriginStore } from './origins';
import type { Origin, Policy } from './policy';
import type { PluginPeopleView } from '../contract';

export interface Access {
  readonly origin: EventOrigin | null;
}

export interface Reach {
  readonly origin: Origin;
}

export interface AuthorityDeps {
  readonly policy: Policy;
  readonly origins: OriginStore;
  readonly channels: Channels;
  readonly people: PluginPeopleView;
}

export class Authority {
  private readonly policy: Policy;
  private readonly origins: OriginStore;
  private readonly channels: Channels;
  private readonly people: PluginPeopleView;

  constructor(deps: AuthorityDeps) {
    ({
      policy: this.policy,
      origins: this.origins,
      channels: this.channels,
      people: this.people,
    } = deps);
  }

  async originOf(eventId: string): Promise<EventOrigin> {
    const origin = this.origins.get(eventId);
    if (origin === undefined) {
      throw new DiscordInputError('Event unknown or no longer retained');
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

  async access(caller: ToolCaller, eventId: string | undefined): Promise<Access> {
    this.assertOwner(caller);
    return { origin: eventId === undefined ? null : await this.originOf(eventId) };
  }

  async reach(
    caller: ToolCaller,
    eventId: string | undefined,
    channelId: string | undefined,
  ): Promise<Reach> {
    const { origin } = await this.access(caller, eventId);
    if (origin !== null) {
      return { origin };
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
    return { origin: synthetic };
  }
}
