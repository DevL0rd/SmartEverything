import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PluginRecords } from '../contract';
import { SNOWFLAKE } from './ids';
import { jsonOf } from './json';
import { PERSON } from './person';

const TEXT_LIMIT = 4000;
const CAPACITY = 25_000;
const EVICT_SHARE = 20;
export const OWNER_CONTEXT_TTL_MS = 24 * 60 * 60_000;
const OWNER_CONTEXT_CAP = 1000;

const EVENT_ORIGIN = z.strictObject({
  id: z.uuid(),
  kind: z.enum(['message', 'interaction', 'voice', 'owner']),
  actorId: SNOWFLAKE,
  channelId: SNOWFLAKE,
  guildId: SNOWFLAKE.nullable(),
  messageId: SNOWFLAKE.optional(),
  sourceEventId: z.uuid().optional(),
  text: z.string().max(TEXT_LIMIT),
  author: PERSON.optional(),
  mentions: z.array(PERSON).max(20).optional(),
  receivedAt: z.iso.datetime(),
});

export type EventOrigin = z.output<typeof EVENT_ORIGIN>;

export interface OriginsLog {
  readonly warn: (event: string, payload: Readonly<Record<string, unknown>>) => void;
}

export class OriginStore {
  private readonly items = new Map<string, EventOrigin>();
  private readonly messages = new Set<string>();

  constructor(
    private readonly records: PluginRecords,
    private readonly log: OriginsLog,
    private readonly capacity = CAPACITY,
    private readonly now: () => number = Date.now,
  ) {}

  load(): void {
    for (const { key, value } of this.records.list()) {
      const parsed = EVENT_ORIGIN.safeParse(value);
      if (!parsed.success || parsed.data.id !== key) {
        this.log.warn('discord.origin_unreadable', { key });
        this.records.remove(key);
      } else if (this.expired(parsed.data)) {
        this.records.remove(key);
      } else {
        this.remember(parsed.data);
      }
    }
  }

  get(id: string): EventOrigin | undefined {
    return this.items.get(id);
  }

  expired(origin: EventOrigin): boolean {
    return (
      origin.kind === 'owner' && this.now() - Date.parse(origin.receivedAt) > OWNER_CONTEXT_TTL_MS
    );
  }

  since(after: string | undefined, limit: number): readonly EventOrigin[] {
    const cursor = cursorOf(after);
    const found = [...this.items.values()]
      .filter((origin) => origin.kind !== 'owner' && cursor.before(origin))
      .sort(byReceived);
    return after === undefined ? found.slice(-limit) : found.slice(0, limit);
  }

  ownerContext(channelId: string, actorId: string, guildId: string, now: Date): EventOrigin {
    const existing = [...this.items.values()].find(
      (origin) =>
        origin.kind === 'owner' &&
        origin.channelId === channelId &&
        origin.actorId === actorId &&
        origin.guildId === guildId,
    );
    if (existing !== undefined && !this.expired(existing)) {
      return existing;
    }
    if (existing !== undefined) {
      this.forget(existing.id);
    }
    const origin: EventOrigin = {
      id: randomUUID(),
      kind: 'owner',
      actorId,
      channelId,
      guildId,
      text: '',
      receivedAt: now.toISOString(),
    };
    this.capture(origin);
    this.trimContexts();
    return origin;
  }

  hasMessage(channelId: string, messageId: string): boolean {
    return this.messages.has(`${channelId}:${messageId}`);
  }

  capture(origin: EventOrigin): void {
    const clipped = { ...origin, text: origin.text.slice(0, TEXT_LIMIT) };
    this.remember(clipped);
    this.records.put(clipped.id, jsonOf(clipped));
    this.trim();
  }

  edit(messageId: string, channelId: string, text: string): void {
    for (const origin of this.items.values()) {
      if (origin.messageId === messageId && origin.channelId === channelId) {
        this.replace({ ...origin, text: text.slice(0, TEXT_LIMIT) });
      }
    }
  }

  forget(id: string): void {
    const origin = this.items.get(id);
    if (origin === undefined) {
      return;
    }
    this.items.delete(id);
    if (origin.messageId !== undefined) {
      this.messages.delete(`${origin.channelId}:${origin.messageId}`);
    }
    this.records.remove(id);
  }

  private remember(origin: EventOrigin): void {
    this.items.set(origin.id, origin);
    if (origin.messageId !== undefined) {
      this.messages.add(`${origin.channelId}:${origin.messageId}`);
    }
  }

  private replace(origin: EventOrigin): void {
    this.items.set(origin.id, origin);
    this.records.put(origin.id, jsonOf(origin));
  }

  private trim(): void {
    const ordinary = [...this.items.values()].filter((origin) => origin.kind !== 'owner');
    if (ordinary.length <= this.capacity) {
      return;
    }
    const drop = Math.max(1, Math.ceil(ordinary.length / EVICT_SHARE));
    for (const origin of ordinary.slice(0, drop)) {
      this.forget(origin.id);
    }
  }

  private trimContexts(): void {
    const contexts = [...this.items.values()]
      .filter((origin) => origin.kind === 'owner')
      .sort(byReceived);
    for (const origin of contexts.slice(0, Math.max(0, contexts.length - OWNER_CONTEXT_CAP))) {
      this.forget(origin.id);
    }
  }
}

function byReceived(left: EventOrigin, right: EventOrigin): number {
  return (
    Date.parse(left.receivedAt) - Date.parse(right.receivedAt) || left.id.localeCompare(right.id)
  );
}

export function cursorOf(after: string | undefined): { before: (origin: EventOrigin) => boolean } {
  if (after === undefined) {
    return { before: () => true };
  }
  const [at = '', id] = after.split('|');
  const time = Date.parse(at);
  return {
    before: (origin): boolean => {
      const received = Date.parse(origin.receivedAt);
      return received > time || (id !== undefined && received === time && origin.id > id);
    },
  };
}

export function cursorFor(origin: EventOrigin): string {
  return `${origin.receivedAt}|${origin.id}`;
}
