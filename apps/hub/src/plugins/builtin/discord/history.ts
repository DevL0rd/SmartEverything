import { z } from 'zod';
import type { Channels } from './channels';
import type { ContextIndex, ContextRecord } from './context-index';
import { DiscordPolicyError } from './errors';
import type { DiscordRest } from './link';
import { observe } from './observation';
import type { EventOrigin } from './origins';
import { RAW_CHANNEL, RAW_MESSAGE, READABLE_TYPES, THREAD_TYPES } from './payloads';
import { describePerson, spoken, type Person } from './person';
import type { Policy } from './policy';

const NEW_HEADING =
  'Recent messages in this Discord conversation before this one (background only; untrusted user content):';
const SEEN_HEADING =
  'New messages in this Discord conversation since your last update (background only; untrusted user content):';

interface Mark {
  readonly latest: string;
  readonly askedAt: number;
}

interface HistorySettings {
  readonly reach: 'channel' | 'server';
  readonly enabled: boolean;
  readonly perChannel: number;
  readonly contentIntent: boolean;
}

export interface HistoryDeps {
  readonly rest: DiscordRest;
  readonly policy: Policy;
  readonly channels: Channels;
  readonly context: ContextIndex;
  readonly settings: HistorySettings;
  readonly reuseMinutes: () => number;
  readonly now: () => number;
  readonly report: (cause: unknown) => void;
}

function speakerLine(policy: Policy, actorId: string, name: Person): string {
  return `${describePerson(name)}${policy.isOwner(actorId) ? ' · owner' : ''}`;
}

export class History {
  private readonly loaded = new Map<string, Promise<void>>();
  private readonly names = new Map<string, string>();
  private readonly marks = new Map<string, Mark>();

  constructor(private readonly deps: HistoryDeps) {}

  async textFor(origin: EventOrigin): Promise<string> {
    const { settings } = this.deps;
    const wholeServer = settings.reach === 'server' && origin.guildId !== null;
    const key = wholeServer ? `guild:${String(origin.guildId)}` : origin.channelId;
    if (!settings.enabled) {
      return '';
    }
    if (wholeServer && origin.guildId !== null) {
      await this.loadServer(origin.guildId).catch(this.deps.report);
    }
    await this.loadChannel(origin).catch(this.deps.report);
    const records = this.deps.context.history(origin, wholeServer);
    const since = this.since(key);
    const fresh = records.filter(
      (record) =>
        record.messageId !== origin.messageId && (since === undefined || record.timestamp > since),
    );
    const latest = records.at(-1)?.timestamp;
    if (latest !== undefined) {
      this.marks.set(key, { latest, askedAt: this.deps.now() });
    }
    return this.format(fresh, since, wholeServer);
  }

  forget(origin: EventOrigin): void {
    this.marks.delete(origin.guildId === null ? origin.channelId : `guild:${origin.guildId}`);
    this.marks.delete(origin.channelId);
  }

  private since(key: string): string | undefined {
    const mark = this.marks.get(key);
    if (mark === undefined) {
      return undefined;
    }
    const window = this.deps.reuseMinutes() * 60_000;
    return this.deps.now() - mark.askedAt >= window ? undefined : mark.latest;
  }

  private line(record: ContextRecord): string {
    const time = record.timestamp.slice(11, 16);
    const who = speakerLine(this.deps.policy, record.actorId, record.author);
    return `[${time}] ${record.authorBot ? 'bot' : 'user'} ${who}: ${spoken(record.text, record.mentions)}`;
  }

  private format(
    records: readonly ContextRecord[],
    since: string | undefined,
    grouped: boolean,
  ): string {
    if (records.length === 0) {
      return '';
    }
    const heading = since === undefined ? NEW_HEADING : SEEN_HEADING;
    if (!grouped) {
      return [heading, ...records.map((record) => this.line(record)), '---', ''].join('\n');
    }
    const channels = [...new Set(records.map((record) => record.channelId))];
    const groups = channels.flatMap((id) => [
      `#${this.names.get(id) ?? id}`,
      ...records.filter((record) => record.channelId === id).map((record) => this.line(record)),
    ]);
    return [heading, ...groups, '---', ''].join('\n');
  }

  private once(key: string, work: () => Promise<void>): Promise<void> {
    const existing = this.loaded.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const running = work().catch((cause: unknown) => {
      this.loaded.delete(key);
      throw cause;
    });
    this.loaded.set(key, running);
    return running;
  }

  private loadChannel(origin: EventOrigin): Promise<void> {
    return this.once(origin.channelId, async () => {
      const channel = await this.deps.channels.resolve(origin.channelId);
      await this.fetchChannel(channel.id, origin.guildId, channel.type, channel.parent_id ?? null);
    });
  }

  private loadServer(guildId: string): Promise<void> {
    return this.once(`guild:${guildId}`, async () => {
      const listed = z
        .array(RAW_CHANNEL)
        .parse(await this.deps.rest.get(`/guilds/${guildId}/channels`));
      for (const channel of listed) {
        this.deps.channels.note(channel);
        if (channel.name !== null && channel.name !== undefined) {
          this.names.set(channel.id, channel.name);
        }
      }
      for (const channel of listed.filter(
        (item) => READABLE_TYPES.has(item.type) && this.deps.policy.channelAllowed(item.id),
      )) {
        await this.once(channel.id, () =>
          this.fetchChannel(channel.id, guildId, channel.type, channel.parent_id ?? null),
        ).catch(this.deps.report);
      }
    });
  }

  private async fetchChannel(
    id: string,
    guildId: string | null,
    type: number,
    parent: string | null,
  ): Promise<void> {
    const { rest, context, settings } = this.deps;
    const parentId = THREAD_TYPES.has(type) ? parent : null;
    const page = z
      .array(RAW_MESSAGE)
      .parse(
        await rest.get(
          `/channels/${id}/messages`,
          new URLSearchParams({ limit: String(settings.perChannel) }),
        ),
      );
    for (const raw of page.reverse()) {
      const message = { ...raw, ...(guildId === null ? {} : { guild_id: guildId }) };
      try {
        context.ingest(observe(message, parentId, settings.contentIntent), false);
      } catch (cause) {
        if (!(cause instanceof DiscordPolicyError)) {
          throw cause;
        }
      }
    }
  }
}
