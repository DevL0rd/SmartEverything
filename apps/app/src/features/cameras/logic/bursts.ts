import { runsOf } from '../../activity';
import type { TimelineKind } from './timeline';

export interface FeedItem {
  readonly id: string;
  readonly at: string;
  readonly kind: TimelineKind;
  readonly deviceId: string;
}

export interface Burst<T extends FeedItem> {
  readonly id: string;
  readonly items: readonly T[];
  readonly oldest: string;
}

export function burstsOf<T extends FeedItem>(newestFirst: readonly T[]): Burst<T>[] {
  return runsOf(
    newestFirst,
    (item) => `${item.deviceId}/${item.kind}`,
    (item) => item.at,
  ).flatMap((run) => {
    const [first] = run.items;
    return first === undefined ? [] : [{ id: first.id, items: run.items, oldest: run.oldest }];
  });
}
