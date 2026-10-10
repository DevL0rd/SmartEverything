import { displayName, readableText, type Person } from './person';
import type { Origin, Policy } from './policy';
import type { Directory } from './directory';
import { DiscordPolicyError } from './errors';

export interface ObservedMessage extends Origin {
  readonly messageId: string;
  readonly author: Person;
  readonly mentions: readonly Person[];
  readonly timestamp: string;
  readonly text: string;
  readonly contentAvailable: boolean;
  readonly authorBot: boolean;
  readonly parentId: string | null;
  readonly replyToId: string | null;
}

export interface ContextRecord extends ObservedMessage {
  readonly observedAt: string;
}

export interface ContextView extends ContextRecord {
  readonly authorName: string;
  readonly fromOwner: boolean;
}

type ContextMode = 'recent' | 'user' | 'search';

export interface ContextSettings {
  readonly enabled: boolean;
  readonly capture: 'all' | 'addressed';
  readonly perChannel: number;
  readonly includeBots: boolean;
}

export interface ContextAsk {
  readonly origin: Origin;
  readonly mode: ContextMode;
  readonly limit: number;
  readonly query: string;
  readonly includeParent: boolean;
}

const MOST = 50;

export class ContextIndex {
  private readonly items = new Map<string, ContextRecord>();
  private evicted = 0;

  constructor(
    private readonly policy: Policy,
    private readonly directory: Directory,
    private readonly settings: ContextSettings,
    private readonly now: () => number,
  ) {}

  ingest(input: ObservedMessage, addressed: boolean): void {
    const config = this.settings;
    if (!config.enabled || (!addressed && config.capture !== 'all')) {
      return;
    }
    if (input.authorBot && !config.includeBots) {
      return;
    }
    this.policy.assertObservation(input);
    for (const who of [input.author, ...input.mentions]) {
      this.directory.learn(who, input.guildId);
    }
    this.items.delete(input.messageId);
    this.items.set(input.messageId, { ...input, observedAt: new Date(this.now()).toISOString() });
    const channel = [...this.items.values()].filter((item) => item.channelId === input.channelId);
    for (const stale of channel.slice(0, Math.max(0, channel.length - config.perChannel))) {
      this.evict(stale.messageId);
    }
  }

  remove(id: string): void {
    this.items.delete(id);
  }

  update(id: string, text: string, available: boolean): void {
    const item = this.items.get(id);
    if (item !== undefined) {
      this.items.set(id, { ...item, text, contentAvailable: available });
    }
  }

  history(origin: Origin, wholeServer: boolean): ContextRecord[] {
    this.assertReadable(origin);
    return [...this.items.values()]
      .filter((record) => this.accessible(record, origin))
      .filter((record) =>
        wholeServer && origin.guildId !== null
          ? record.guildId === origin.guildId
          : record.channelId === origin.channelId,
      )
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  }

  query(ask: ContextAsk): {
    readonly records: readonly ContextView[];
    readonly retained: number;
    readonly evicted: number;
    readonly incomplete: true;
    readonly search: string;
    readonly persistent: false;
  } {
    const { origin } = ask;
    this.assertReadable(origin);
    const records = [...this.items.values()].filter((record) => this.accessible(record, origin));
    const anchor = records.find((record) => record.messageId === origin.messageId);
    const parent = ask.includeParent ? anchor?.parentId : undefined;
    const selected = records.filter((record) => this.matches(record, ask, parent));
    return {
      records: selected
        .reverse()
        .slice(0, Math.min(MOST, ask.limit))
        .map((record) => this.present(record)),
      retained: records.length,
      evicted: this.evicted,
      incomplete: true,
      search: 'case-insensitive literal substring; retained text only',
      persistent: false,
    };
  }

  private assertReadable(origin: Origin): void {
    this.policy.assertOrigin(origin);
    if (!this.settings.enabled) {
      throw new DiscordPolicyError('Context capture is disabled in the plugin settings');
    }
  }

  private evict(id: string): void {
    this.items.delete(id);
    this.evicted += 1;
  }

  private present(record: ContextRecord): ContextView {
    return {
      ...record,
      text: readableText(record.text, record.mentions),
      authorName: displayName(record.author),
      fromOwner: this.policy.isOwner(record.actorId),
    };
  }

  private accessible(record: ContextRecord, origin: Origin): boolean {
    try {
      this.policy.assertObservation(record);
    } catch (cause) {
      if (cause instanceof DiscordPolicyError) {
        return false;
      }
      throw cause;
    }
    if (origin.guildId === null) {
      return record.guildId === null && record.actorId === origin.actorId;
    }
    return record.guildId !== null;
  }

  private matches(
    record: ContextRecord,
    ask: ContextAsk,
    parent: string | null | undefined,
  ): boolean {
    if (ask.mode === 'user') {
      return record.actorId === ask.origin.actorId;
    }
    const sameChannel =
      record.channelId === ask.origin.channelId ||
      (parent !== undefined && parent !== null && record.channelId === parent);
    if (!sameChannel) {
      return false;
    }
    return (
      ask.mode !== 'search' ||
      record.text.toLocaleLowerCase().includes(ask.query.toLocaleLowerCase())
    );
  }
}
