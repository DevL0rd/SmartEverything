import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Reach } from './authority';
import { DiscordInputError, DiscordPolicyError } from './errors';
import { SNOWFLAKE } from './ids';
import type { Policy } from './policy';

const SOURCE_LIFETIME_MS = 10 * 60_000;
const PAGE_LIFETIME_MS = 60_000;
const MAX_SOURCES = 1000;
const MAX_PAGES = 16;

const MEDIA_ATTACHMENT = z.object({
  id: SNOWFLAKE,
  filename: z.string().min(1).max(256),
  size: z.number().int().min(1),
  content_type: z.string().max(100).nullish(),
  url: z.url(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});

type MediaAttachment = z.output<typeof MEDIA_ATTACHMENT>;

export const MEDIA_MESSAGE = z.object({
  id: SNOWFLAKE,
  channel_id: SNOWFLAKE,
  author: z.object({ id: SNOWFLAKE }),
  timestamp: z.iso.datetime({ offset: true }),
  attachments: z.array(MEDIA_ATTACHMENT).max(10),
});

export type MediaMessage = z.output<typeof MEDIA_MESSAGE>;

export interface MediaEntry {
  readonly attachment: MediaAttachment;
  readonly messageId: string;
  readonly channelId: string;
  readonly guildId: string | null;
  readonly userId: string;
  readonly timestamp: string;
  readonly storedAt: number;
}

export const MEDIA_SEARCH = z.strictObject({
  channelId: SNOWFLAKE.optional(),
  userId: SNOWFLAKE.optional(),
  messageId: SNOWFLAKE.optional(),
  attachmentIds: z.array(SNOWFLAKE).min(1).max(10).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  kind: z.enum(['all', 'image', 'file']).default('all'),
  limit: z.number().int().min(1).max(25).default(10),
  cursor: z.uuid().optional(),
});

export type MediaSearch = z.output<typeof MEDIA_SEARCH>;

export interface MediaSettings {
  readonly enabled: boolean;
  readonly capture: 'all' | 'addressed';
  readonly maxAttachments: number;
  readonly ttlMinutes: number;
}

interface Page {
  readonly key: string;
  readonly fingerprint: string;
  readonly entries: readonly MediaEntry[];
  readonly expires: number;
}

interface Source {
  readonly key: string;
  readonly entry: MediaEntry;
  readonly expires: number;
}

function jumpUrl(entry: MediaEntry): string {
  return `https://discord.com/channels/${entry.guildId ?? '@me'}/${entry.channelId}/${entry.messageId}`;
}

function isImage(entry: MediaEntry): boolean {
  const type = entry.attachment.content_type;
  return type === undefined || type === null
    ? /\.(png|jpe?g|gif|webp)$/i.test(entry.attachment.filename)
    : type.startsWith('image/');
}

type Filters = Omit<MediaSearch, 'cursor' | 'limit'>;

function kindMatches(entry: MediaEntry, kind: Filters['kind']): boolean {
  const image = isImage(entry);
  return !((kind === 'image' && !image) || (kind === 'file' && image));
}

function identityMatches(entry: MediaEntry, search: Filters): boolean {
  return (
    (search.userId === undefined || search.userId === entry.userId) &&
    (search.messageId === undefined || search.messageId === entry.messageId) &&
    (search.attachmentIds === undefined || search.attachmentIds.includes(entry.attachment.id))
  );
}

function timeMatches(entry: MediaEntry, search: Filters): boolean {
  const at = Date.parse(entry.timestamp);
  return (
    (search.from === undefined || at >= Date.parse(search.from)) &&
    (search.to === undefined || at <= Date.parse(search.to))
  );
}

export function matches(entry: MediaEntry, search: Filters): boolean {
  return (
    kindMatches(entry, search.kind) && identityMatches(entry, search) && timeMatches(entry, search)
  );
}

function evictOldest(map: Map<string, unknown>, capacity: number): void {
  for (const key of map.keys()) {
    if (map.size < capacity) {
      return;
    }
    map.delete(key);
  }
}

export class MediaIndex {
  private readonly entries = new Map<string, MediaEntry>();
  private readonly sources = new Map<string, Source>();
  private readonly pages = new Map<string, Page>();

  constructor(
    private readonly policy: Policy,
    private readonly settings: MediaSettings,
    private readonly now: () => number,
  ) {}

  remove(messageId: string): void {
    for (const [key, entry] of this.entries) {
      if (entry.messageId === messageId) {
        this.entries.delete(key);
      }
    }
    for (const [key, source] of this.sources) {
      if (source.entry.messageId === messageId) {
        this.sources.delete(key);
      }
    }
  }

  records(message: MediaMessage, guildId: string | null): MediaEntry[] {
    return message.attachments.map((attachment) => ({
      attachment,
      guildId,
      messageId: message.id,
      channelId: message.channel_id,
      userId: message.author.id,
      timestamp: message.timestamp,
      storedAt: this.now(),
    }));
  }

  ingest(message: MediaMessage, guildId: string | null, addressed: boolean): void {
    const { settings } = this;
    if (!settings.enabled || (settings.capture === 'addressed' && !addressed)) {
      return;
    }
    this.policy.assertObservation({
      actorId: message.author.id,
      channelId: message.channel_id,
      guildId,
    });
    this.prune();
    this.remove(message.id);
    for (const entry of this.records(message, guildId)) {
      this.entries.set(`${message.id}:${entry.attachment.id}`, entry);
    }
    while (this.entries.size > settings.maxAttachments) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) {
        break;
      }
      this.entries.delete(oldest.value);
    }
  }

  source(reach: Reach, id: string): MediaEntry {
    this.prune();
    const source = this.sources.get(id);
    if (source?.key !== reach.key) {
      throw new DiscordInputError('Attachment handle expired or belongs to another request');
    }
    return source.entry;
  }

  expose(reach: Reach, entry: MediaEntry): Readonly<Record<string, unknown>> {
    this.prune();
    if (!this.allowed(reach, entry)) {
      throw new DiscordPolicyError('Attachment source is outside current resource grants');
    }
    evictOldest(this.sources, MAX_SOURCES);
    const sourceId = randomUUID();
    this.sources.set(sourceId, { key: reach.key, entry, expires: this.now() + SOURCE_LIFETIME_MS });
    const { url: _url, ...attachment } = entry.attachment;
    return {
      sourceId,
      ...attachment,
      messageId: entry.messageId,
      channelId: entry.channelId,
      guildId: entry.guildId,
      userId: entry.userId,
      timestamp: entry.timestamp,
      imageTypeVerified: false,
      jumpUrl: jumpUrl(entry),
    };
  }

  search(
    reach: Reach,
    input: MediaSearch,
  ): {
    readonly attachments: readonly Readonly<Record<string, unknown>>[];
    readonly nextCursor: string | null;
    readonly coverage: 'bounded-local-index';
    readonly incomplete: true;
    readonly retentionMinutes: number;
    readonly indexed: number;
  } {
    this.prune();
    const { cursor, limit, ...filters } = input;
    const fingerprint = JSON.stringify(filters);
    const snapshot =
      cursor === undefined
        ? [...this.entries.values()]
        : this.resume(cursor, reach.key, fingerprint);
    const entries = snapshot
      .filter(
        (entry) =>
          this.allowed(reach, entry) &&
          (input.channelId === undefined || entry.channelId === input.channelId) &&
          matches(entry, input),
      )
      .sort(
        (left, right) =>
          Date.parse(right.timestamp) - Date.parse(left.timestamp) ||
          right.attachment.id.localeCompare(left.attachment.id),
      );
    return {
      attachments: entries.slice(0, limit).map((entry) => this.expose(reach, entry)),
      nextCursor: this.save(reach.key, fingerprint, entries.slice(limit)),
      coverage: 'bounded-local-index',
      incomplete: true,
      retentionMinutes: this.settings.ttlMinutes,
      indexed: this.entries.size,
    };
  }

  private expired(entry: MediaEntry): boolean {
    return entry.storedAt + this.settings.ttlMinutes * 60_000 <= this.now();
  }

  private prune(): void {
    for (const [key, entry] of this.entries) {
      if (this.expired(entry)) {
        this.entries.delete(key);
      }
    }
    for (const map of [this.sources, this.pages]) {
      for (const [key, item] of map) {
        if (item.expires <= this.now()) {
          map.delete(key);
        }
      }
    }
  }

  private allowed(reach: Reach, entry: MediaEntry): boolean {
    const { origin } = reach;
    if (this.expired(entry)) {
      return false;
    }
    if (
      entry.guildId !== origin.guildId ||
      (origin.guildId === null && entry.channelId !== origin.channelId)
    ) {
      return false;
    }
    try {
      this.policy.assertObservation({
        actorId: entry.userId,
        channelId: entry.channelId,
        guildId: entry.guildId,
      });
      return true;
    } catch (cause) {
      if (cause instanceof DiscordPolicyError) {
        return false;
      }
      throw cause;
    }
  }

  private resume(cursor: string, key: string, fingerprint: string): readonly MediaEntry[] {
    const page = this.pages.get(cursor);
    if (page?.key !== key || page.fingerprint !== fingerprint) {
      throw new DiscordInputError('Cursor expired or filters/request changed');
    }
    return page.entries;
  }

  private save(key: string, fingerprint: string, entries: readonly MediaEntry[]): string | null {
    if (entries.length === 0) {
      return null;
    }
    evictOldest(this.pages, MAX_PAGES);
    const id = randomUUID();
    this.pages.set(id, { key, fingerprint, entries, expires: this.now() + PAGE_LIFETIME_MS });
    return id;
  }
}
