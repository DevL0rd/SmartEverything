import type { Directory } from '../directory';
import type { DiscordRest } from '../link';
import { RAW_MEMBER, RAW_USER } from '../payloads';
import { person, rawPerson, type Person } from '../person';
import type { VoiceState } from './link';

const NEGATIVE_MS = 10 * 60_000;

const MEMBER = RAW_MEMBER.extend({ user: RAW_USER });

export class Roster {
  private readonly tried = new Map<string, number>();

  constructor(
    private readonly directory: Directory,
    private readonly rest: DiscordRest,
    private readonly now: () => number,
  ) {}

  person(guildId: string, userId: string): Person {
    return this.directory.person(userId, guildId);
  }

  learn(state: VoiceState): void {
    const user = state.member?.user;
    if (user === undefined || state.guild_id === undefined) {
      return;
    }
    this.directory.learnVisible(
      person(user.id, user.username, user.global_name, state.member?.nick),
      state.guild_id,
      true,
    );
  }

  async known(guildId: string, userId: string): Promise<Person> {
    const known = this.person(guildId, userId);
    const key = `${guildId}:${userId}`;
    if (known.username !== null || (this.tried.get(key) ?? 0) > this.now()) {
      return known;
    }
    this.tried.set(key, this.now() + NEGATIVE_MS);
    const found = MEMBER.safeParse(
      await this.rest.get(`/guilds/${guildId}/members/${userId}`).catch(() => null),
    );
    if (found.success) {
      this.directory.learnVisible(rawPerson(found.data.user, found.data), guildId, true);
    }
    return this.person(guildId, userId);
  }

  names(guildId: string, userIds: readonly string[]): string[] {
    return userIds.flatMap((id) => {
      const who = this.person(guildId, id);
      return [who.nickname, who.globalName, who.username].filter(
        (name): name is string => name !== null,
      );
    });
  }
}
