import type { EventRow, RecordingRow } from '@smarteverything/domain';
import type { PhoneViewer } from '../../../phones/phone-detail';
import { visibleEvents, visibleRows } from '../../../phones/phone-visibility';
import { storeUnit } from '../../../store/host/unit';
import type { EventListWindow } from '../../../store/repositories/events';
import type { BucketQuery, HistoryQuery } from '../../../store/repositories/state';

export const MCP_VISIBLE_HISTORY_UNIT = storeUnit(
  (store, { viewer, query }: { readonly viewer: PhoneViewer; readonly query: HistoryQuery }) =>
    visibleRows(store, viewer, store.state.history(query)),
);

export const MCP_VISIBLE_BUCKETS_UNIT = storeUnit(
  (store, { viewer, query }: { readonly viewer: PhoneViewer; readonly query: BucketQuery }) =>
    visibleRows(store, viewer, store.state.buckets(query)),
);

export interface EventsAsk {
  readonly viewer: PhoneViewer;
  readonly window: EventListWindow;
  readonly reachable: readonly string[] | null;
}

export interface EventsFound {
  readonly events: EventRow[];
  readonly recordings: RecordingRow[];
}

export const MCP_VISIBLE_EVENTS_UNIT = storeUnit(
  (store, { viewer, window, reachable }: EventsAsk): EventsFound => {
    const allowed = reachable === null ? null : new Set(reachable);
    const events = visibleEvents(
      store,
      viewer,
      store.events
        .list(window)
        .filter(
          (event) => allowed === null || event.device_id === null || allowed.has(event.device_id),
        ),
    );
    return {
      events,
      recordings: store.cameras.recordingsOfEvents(events.map((event) => event.id)),
    };
  },
);
