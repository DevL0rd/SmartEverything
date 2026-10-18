import { z } from 'zod';
import type { PluginRecords } from '../contract';
import { SNOWFLAKE } from './ids';
import { jsonOf } from '../json-value';
import type { Person } from './person';

const TEXT_LIMIT = 4000;
const CAPACITY = 25_000;

const ROUTE = z.object({
  id: z.uuid(),
  kind: z.enum(['message', 'interaction', 'voice']),
  actorId: SNOWFLAKE,
  channelId: SNOWFLAKE,
  guildId: SNOWFLAKE.nullable(),
  messageId: SNOWFLAKE.optional(),
  sourceEventId: z.uuid().optional(),
  receivedAt: z.iso.datetime(),
});

export type EventOrigin = z.output<typeof ROUTE> & {
  readonly text: string;
  readonly author?: Person | undefined;
  readonly mentions?: readonly Person[] | undefined;
};

export interface OriginsLog {
  readonly warn: (event: string, payload: Readonly<Record<string, unknown>>) => void;
}

function messageKey(origin: Pick<EventOrigin, 'channelId' | 'messageId'>): string {
  return `${origin.channelId}:${origin.messageId ?? ''}`;
}

function routeOf(origin: EventOrigin): z.output<typeof ROUTE> {
  const { text: _text, author: _author, mentions: _mentions, ...route } = origin;
  return route;
}

export class OriginStore {
  private readonly items = new Map<string, EventOrigin>();
  private readonly messages = new Map<string, string>();

  constructor(
    private readonly records: PluginRecords,
    private readonly log: OriginsLog,
    private readonly capacity = CAPACITY,
  ) {}

  load(): void {
    const routes: z.output<typeof ROUTE>[] = [];
    for (const { key, value } of this.records.list()) {
      const parsed = ROUTE.safeParse(value);
      if (parsed.success && parsed.data.id === key) {
        routes.push(parsed.data);
      } else {
        this.log.warn('discord.origin_unreadable', { key });
        this.records.remove(key);
      }
    }
    routes.sort(byReceived);
    for (const route of routes) {
      this.remember({ ...route, text: '' });
    }
    this.evict();
  }

  get(id: string): EventOrigin | undefined {
    return this.items.get(id);
  }

  since(after: string | undefined, limit: number): readonly EventOrigin[] {
    const cursor = cursorOf(after);
    const found = [...this.items.values()].filter((origin) => cursor.before(origin));
    return after === undefined ? found.slice(-limit) : found.slice(0, limit);
  }

  hasMessage(channelId: string, messageId: string): boolean {
    return this.messages.has(messageKey({ channelId, messageId }));
  }

  capture(origin: EventOrigin): void {
    const clipped = { ...origin, text: origin.text.slice(0, TEXT_LIMIT) };
    this.remember(clipped);
    this.records.put(clipped.id, jsonOf(routeOf(clipped)));
    this.evict();
  }

  edit(messageId: string, channelId: string, text: string): void {
    const id = this.messages.get(messageKey({ channelId, messageId }));
    const origin = id === undefined ? undefined : this.items.get(id);
    if (origin !== undefined) {
      this.items.set(origin.id, { ...origin, text: text.slice(0, TEXT_LIMIT) });
    }
  }

  private remember(origin: EventOrigin): void {
    this.items.set(origin.id, origin);
    if (origin.messageId !== undefined) {
      this.messages.set(messageKey(origin), origin.id);
    }
  }

  private evict(): void {
    for (const [id, origin] of this.items) {
      if (this.items.size <= this.capacity) {
        return;
      }
      this.items.delete(id);
      if (origin.messageId !== undefined) {
        this.messages.delete(messageKey(origin));
      }
      this.records.remove(id);
    }
  }
}

function byReceived(
  left: Pick<EventOrigin, 'receivedAt' | 'id'>,
  right: Pick<EventOrigin, 'receivedAt' | 'id'>,
): number {
  return (
    Date.parse(left.receivedAt) - Date.parse(right.receivedAt) || left.id.localeCompare(right.id)
  );
}

function cursorOf(after: string | undefined): { before: (origin: EventOrigin) => boolean } {
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
