import type { TreadmillLiveFrame, TreadmillLiveNotice } from '@smarteverything/domain';
import type { QueryClient } from '@tanstack/react-query';
import { background } from '@smarteverything/logging';
import { ValueStore, usePausable } from '../../../design/external-store';
import { noticeHandler } from '../../../store/notice-registry';
import { appendPoint, needsRefresh, pointOf, type LivePoint } from '../model/speed-history';
import { treadmillPrefix } from './treadmill-keys';

export interface TreadmillLive {
  readonly frame: TreadmillLiveFrame | null;
  readonly points: readonly LivePoint[];
}

const EMPTY: TreadmillLive = { frame: null, points: [] };

class TreadmillLiveStore {
  private readonly stores = new Map<string, ValueStore<TreadmillLive>>();

  store(deviceId: string): ValueStore<TreadmillLive> {
    const known = this.stores.get(deviceId);
    if (known !== undefined) {
      return known;
    }
    const created = new ValueStore(EMPTY);
    this.stores.set(deviceId, created);
    return created;
  }

  receive(notice: TreadmillLiveNotice, client: QueryClient): void {
    const store = this.store(notice.deviceId);
    const current = store.get();
    const { frame } = notice;
    if (current.frame !== null && Date.parse(frame.at) < Date.parse(current.frame.at)) {
      return;
    }
    store.set({
      frame,
      points: appendPoint(current.points, pointOf(frame)),
    });
    if (needsRefresh(current.frame, frame)) {
      background(
        client.invalidateQueries({ queryKey: treadmillPrefix(notice.deviceId) }),
        'queries.invalidate_failed',
      );
    }
  }
}

const treadmillLive = new TreadmillLiveStore();

export const TREADMILL_LIVE_NOTICES = noticeHandler(['treadmill_live'], (message, { client }) => {
  treadmillLive.receive(message, client);
});

export function useTreadmillLive<T>(deviceId: string, select: (live: TreadmillLive) => T): T {
  const store = treadmillLive.store(deviceId);
  return usePausable(store.subscribe, () => select(store.get()));
}
