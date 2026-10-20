import type { DeviceEvent, EventKind, JsonValue } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { DrinkItem } from './drinks';

const EVENTS_PER_SYNC = 20;

export const IMPORT_AGE_MS = 30 * 60_000;

const MS_PER_SECOND = 1000;

export class EventBatch {
  private readonly list: DeviceEvent[] = [];
  private dropped = 0;

  constructor(
    private readonly externalId: string,
    private readonly log: Logger,
  ) {}

  add(
    kind: EventKind,
    at: Date,
    details: Readonly<Record<string, JsonValue>>,
    occurrence: string,
  ): void {
    if (this.list.length >= EVENTS_PER_SYNC) {
      this.dropped += 1;
      return;
    }
    this.list.push({
      externalId: this.externalId,
      kind,
      occurredAt: at.toISOString(),
      details,
      occurrence,
    });
  }

  finish(): readonly DeviceEvent[] {
    if (this.dropped > 0) {
      this.log.warn('bottle.events_dropped', {
        externalId: this.externalId,
        dropped: this.dropped,
        limit: EVENTS_PER_SYNC,
      });
    }
    return this.list;
  }
}

export function drinkEvents(
  batch: EventBatch,
  items: readonly DrinkItem[],
  profileId: string | null,
  now: Date,
): void {
  const settled = items.filter((item) => now.getTime() - item.at * MS_PER_SECOND > IMPORT_AGE_MS);
  const recent = items.filter((item) => !settled.includes(item));
  const imported = settled.filter((item) => item.kind === 'drink');
  if (imported.length > 0) {
    batch.add(
      'activity',
      now,
      {
        activity: 'drinks_imported',
        count: imported.length,
        ml: imported.reduce((total, item) => total + item.ml, 0),
        profileId,
      },
      `imported:${String(imported[0]?.at ?? 0)}:${String(imported.length)}`,
    );
  }
  for (const item of recent) {
    const at = new Date(item.at * MS_PER_SECOND);
    batch.add(
      'activity',
      at,
      item.kind === 'drink'
        ? { activity: 'drink', ml: item.ml, levelMl: item.levelMl, profileId }
        : { activity: 'refill', ml: item.ml, levelMl: item.levelMl },
      `${item.kind}:${String(item.at)}`,
    );
  }
}
