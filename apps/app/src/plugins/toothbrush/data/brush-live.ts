import type { BrushLiveFrame, BrushLiveNotice } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { QueryClient } from '@tanstack/react-query';
import { ValueStore, usePausable } from '../../../design/external-store';
import { noticeHandler } from '../../../store/notice-registry';
import { needsRefresh } from '../model/live-frame';
import { brushPrefix } from './brush-keys';

export interface BrushLive {
  readonly frame: BrushLiveFrame | null;
}

const EMPTY: BrushLive = { frame: null };

class BrushLiveStore {
  private readonly stores = new Map<string, ValueStore<BrushLive>>();

  store(deviceId: string): ValueStore<BrushLive> {
    const known = this.stores.get(deviceId);
    if (known !== undefined) {
      return known;
    }
    const created = new ValueStore(EMPTY);
    this.stores.set(deviceId, created);
    return created;
  }

  receive(notice: BrushLiveNotice, client: QueryClient): void {
    const store = this.store(notice.deviceId);
    const current = store.get().frame;
    const { frame } = notice;
    if (current !== null && Date.parse(frame.at) < Date.parse(current.at)) {
      return;
    }
    store.set({ frame });
    if (needsRefresh(current, frame)) {
      background(
        client.invalidateQueries({ queryKey: brushPrefix(notice.deviceId) }),
        'queries.invalidate_failed',
      );
    }
  }
}

const brushLive = new BrushLiveStore();

export const BRUSH_LIVE_NOTICES = noticeHandler(['toothbrush_live'], (message, { client }) => {
  brushLive.receive(message, client);
});

export function useBrushLive<T>(deviceId: string, select: (live: BrushLive) => T): T {
  const store = brushLive.store(deviceId);
  return usePausable(store.subscribe, () => select(store.get()));
}
