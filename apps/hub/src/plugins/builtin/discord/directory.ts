import type { PluginPeopleView } from '../contract';
import { DiscordInputError } from './errors';
import { SNOWFLAKE } from './ids';
import { RAW_MEMBER, RAW_USER } from './payloads';
import { cleanName, describePerson, person, rawPerson, type Person } from './person';
import type { Policy } from './policy';
import type { DiscordRest } from './link';
import { z } from 'zod';

const CAPACITY = 5000;
const NEGATIVE_MS = 10 * 60_000;
const SEARCH_LIMIT = 25;
const AMBIGUOUS_SHOWN = 10;

interface Entry {
  readonly id: string;
  username: string | null;
  globalName: string | null;
  readonly nicknames: Map<string, string>;
}

function noteNickname(
  entry: Entry,
  who: Person,
  guildId: string | null,
  memberKnown: boolean,
): void {
  if (guildId === null) {
    return;
  }
  if (who.nickname !== null) {
    entry.nicknames.set(guildId, who.nickname);
  } else if (memberKnown) {
    entry.nicknames.delete(guildId);
  }
}

const MENTION = /^<@!?(\d{17,20})>$/;

const MEMBER_HIT = RAW_MEMBER.extend({ user: RAW_USER });

export interface DirectoryEnvironment {
  readonly now: () => number;
  readonly report: (cause: unknown) => void;
}

export class Directory {
  private readonly entries = new Map<string, Entry>();
  private readonly attempted = new Map<string, number>();

  constructor(
    private readonly policy: Policy,
    private readonly people: PluginPeopleView,
    private readonly rest: DiscordRest,
    private readonly env: DirectoryEnvironment,
  ) {}

  learn(who: Person, guildId: string | null, memberKnown = false): void {
    const entry = this.entries.get(who.id) ?? {
      id: who.id,
      username: null,
      globalName: null,
      nicknames: new Map<string, string>(),
    };
    entry.username = who.username ?? entry.username;
    entry.globalName = who.globalName ?? entry.globalName;
    noteNickname(entry, who, guildId, memberKnown);
    this.entries.delete(who.id);
    this.entries.set(who.id, entry);
    const oldest = this.entries.size > CAPACITY ? this.entries.keys().next() : null;
    if (oldest !== null && oldest.done !== true) {
      this.entries.delete(oldest.value);
    }
  }

  learnVisible(who: Person, guildId: string | null, memberKnown = false): void {
    const visible =
      guildId === null ? this.policy.userAllowed(who.id) : this.policy.guildAllowed(guildId);
    if (visible) {
      this.learn(who, guildId, memberKnown);
    }
  }

  person(id: string, guildId?: string | null): Person {
    const entry = this.entries.get(id);
    if (entry === undefined) {
      return person(id);
    }
    const nickname =
      guildId === undefined || guildId === null ? null : (entry.nicknames.get(guildId) ?? null);
    return { id, username: entry.username, globalName: entry.globalName, nickname };
  }

  async approved(): Promise<Person[]> {
    const ids = this.people.list().map((item) => item.external_id);
    for (const id of ids) {
      await this.fetchUser(id);
    }
    return ids.map((id) => this.person(id));
  }

  async searchGuild(guildId: string, query: string): Promise<void> {
    if (!this.policy.guildAllowed(guildId)) {
      return;
    }
    const params = new URLSearchParams({ query: query.slice(0, 100), limit: String(SEARCH_LIMIT) });
    const found = await this.rest
      .get(`/guilds/${guildId}/members/search`, params)
      .catch((cause: unknown) => {
        this.env.report(cause);
        return [];
      });
    const members = z.array(MEMBER_HIT).safeParse(found);
    for (const member of members.success ? members.data : []) {
      this.learn(rawPerson(member.user, member), guildId, true);
    }
  }

  find(query: string, guildId?: string, exact = false): Person[] {
    const wanted = query.replace(/^@/, '').trim().toLocaleLowerCase();
    if (wanted === '') {
      return [];
    }
    const hit = (name: string): boolean =>
      exact ? name.toLocaleLowerCase() === wanted : name.toLocaleLowerCase().includes(wanted);
    return [...this.entries.values()]
      .filter((entry) => this.names(entry, guildId).some(hit))
      .map((entry) => this.person(entry.id, guildId ?? [...entry.nicknames.keys()].at(-1)));
  }

  async resolve(value: string, guildId?: string): Promise<string> {
    const text = value.trim();
    const direct =
      MENTION.exec(text)?.[1] ?? (SNOWFLAKE.safeParse(text).success ? text : undefined);
    if (direct !== undefined) {
      return direct;
    }
    await this.approved();
    let matches = this.find(text, guildId, true);
    if (matches.length === 0 && guildId !== undefined) {
      await this.searchGuild(guildId, text.replace(/^@/, ''));
      matches = this.find(text, guildId, true);
    }
    const [only] = matches;
    if (matches.length === 1 && only !== undefined) {
      return only.id;
    }
    if (matches.length === 0) {
      throw new DiscordInputError(
        `No known Discord person is named "${cleanName(text)}". Look them up with the read tool (action people), or pass their ID.`,
      );
    }
    throw new DiscordInputError(
      `"${cleanName(text)}" matches ${String(matches.length)} people, so it was not used. Pass the numeric ID of the one you mean: ${matches
        .slice(0, AMBIGUOUS_SHOWN)
        .map(describePerson)
        .join('; ')}`,
    );
  }

  private async fetchUser(id: string): Promise<void> {
    const known = this.entries.get(id);
    if (
      (known !== undefined && known.username !== null) ||
      (this.attempted.get(id) ?? 0) > this.env.now()
    ) {
      return;
    }
    this.attempted.set(id, this.env.now() + NEGATIVE_MS);
    const found = await this.rest.get(`/users/${id}`).catch((cause: unknown) => {
      this.env.report(cause);
      return null;
    });
    const user = RAW_USER.safeParse(found);
    if (user.success && user.data.id === id) {
      this.learn(rawPerson(user.data), null);
    }
  }

  private names(entry: Entry, guildId?: string): string[] {
    const nicknames =
      guildId === undefined ? [...entry.nicknames.values()] : [entry.nicknames.get(guildId)];
    return [entry.username, entry.globalName, ...nicknames].filter(
      (name): name is string => name !== null && name !== undefined && name !== '',
    );
  }
}
