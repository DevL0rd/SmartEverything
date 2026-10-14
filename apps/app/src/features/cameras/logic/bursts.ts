import { cameraDetectionOf } from '@smarteverything/domain';
import { runsOf } from '../../activity';
import type { TimelineKind } from './timeline';

export interface FeedItem {
  readonly id: string;
  readonly at: string;
  readonly kind: TimelineKind;
  readonly deviceId: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly event?: { readonly details?: Readonly<Record<string, unknown>> } | null;
}

export interface Burst<T extends FeedItem> {
  readonly id: string;
  readonly items: readonly T[];
  readonly oldest: string;
}

function burstIdentity(item: FeedItem): string {
  const detection =
    item.kind === 'recording'
      ? null
      : cameraDetectionOf(item.kind, item.details ?? item.event?.details ?? {});
  return `${item.deviceId}/${item.kind}/${detection ?? ''}`;
}

export function burstsOf<T extends FeedItem>(newestFirst: readonly T[]): Burst<T>[] {
  return runsOf(newestFirst, burstIdentity, (item) => item.at).flatMap((run) => {
    const [first] = run.items;
    return first === undefined ? [] : [{ id: first.id, items: run.items, oldest: run.oldest }];
  });
}
