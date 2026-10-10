import { DiscordInputError } from './errors';
import type { DiscordRest } from './link';
import { RAW_CHANNEL, THREAD_TYPES, type RawChannel } from './payloads';
import type { Policy } from './policy';

const CAPACITY = 5000;

export class Channels {
  private readonly known = new Map<string, RawChannel>();

  constructor(
    private readonly rest: DiscordRest,
    private readonly policy: Policy,
  ) {}

  note(channel: RawChannel): void {
    this.known.delete(channel.id);
    this.known.set(channel.id, channel);
    if (
      THREAD_TYPES.has(channel.type) &&
      channel.parent_id !== undefined &&
      channel.parent_id !== null
    ) {
      this.policy.noteThread(channel.id, channel.parent_id);
    }
    const oldest = this.known.size > CAPACITY ? this.known.keys().next() : null;
    if (oldest !== null && oldest.done !== true) {
      this.known.delete(oldest.value);
    }
  }

  async resolve(id: string): Promise<RawChannel> {
    const cached = this.known.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const channel = RAW_CHANNEL.parse(await this.rest.get(`/channels/${id}`));
    this.note(channel);
    return channel;
  }

  async guildChannel(id: string): Promise<RawChannel & { readonly guild_id: string }> {
    const channel = await this.resolve(id);
    this.policy.assertChannel(id);
    if (channel.guild_id === undefined) {
      throw new DiscordInputError('This operation requires a guild channel');
    }
    this.policy.assertGuild(channel.guild_id);
    return { ...channel, guild_id: channel.guild_id };
  }
}
