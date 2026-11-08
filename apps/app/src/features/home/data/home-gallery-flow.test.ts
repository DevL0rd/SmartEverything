import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { LIVE_CHANGE, SNAPSHOT, type DeviceGroupRow, type Snapshot } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  galleryItems,
  targetByKey,
  type GalleryAdd,
} from '../../../components/widget-board/edit/gallery-model';
import {
  useGalleryFlow,
  type GalleryFlow,
} from '../../../components/widget-board/edit/use-gallery-flow';
import { usePickerSource } from '../../../components/widget-board/picker-source';
import { CommandLedger } from '../../../store/command-ledger';
import { deviceFixture } from '../../../store/device-fixture';
import { EntityStore } from '../../../store/entity-store';
import { StoreProvider } from '../../../store/store-context';
import { DEVICE_GROUP_WIDGET } from '../../device-groups';

const STAMP = '2026-01-01T00:00:00.000Z';
const CLIENT = '00000000-0000-4000-8000-000000000001';
const FIRST_DEVICE = deviceFixture(0, {
  id: '00000000-0000-4000-8000-000000000002',
  room_id: null,
});
const SECOND_DEVICE = deviceFixture(5, {
  id: '00000000-0000-4000-8000-000000000003',
  room_id: null,
});
const GROUP: DeviceGroupRow = {
  id: '00000000-0000-4000-8000-000000000004',
  name: 'First group',
  device_ids: [FIRST_DEVICE.id],
  created_at: STAMP,
  updated_at: STAMP,
};
const OTHER_GROUP: DeviceGroupRow = {
  ...GROUP,
  id: '00000000-0000-4000-8000-000000000005',
  name: 'Other group',
  device_ids: [SECOND_DEVICE.id],
};

function snapshotOf(seq: number, groups: readonly DeviceGroupRow[]): Snapshot {
  return SNAPSHOT.parse({
    seq,
    session: {
      client: {
        id: CLIENT,
        name: 'Member',
        platform: 'web',
        role: 'member',
        built_in: false,
        created_at: STAMP,
        last_seen_at: null,
      },
      hub: { version: '1.0.0', startedAt: STAMP, cameras: 'running' },
    },
    firewall: null,
    owner: null,
    tables: {
      settings: {
        home_name: 'Home',
        time_zone: 'UTC',
        latitude: null,
        longitude: null,
        public_url: null,
        public_url_checked_at: null,
        public_url_verified_at: null,
        public_url_error: null,
        ice_servers: [],
        webrtc_candidates: [],
        push_project_id: null,
        updated_at: STAMP,
      },
      rooms: [],
      device_groups: groups,
      devices: groups.includes(GROUP) ? [FIRST_DEVICE, SECOND_DEVICE] : [SECOND_DEVICE],
      device_state: [],
      cameras: [],
      scenes: [],
      automations: [],
      provider_links: [],
      ir_remotes: [],
      ir_codes: [],
      layouts: [],
      events: [],
      commands: [],
      recordings: [],
      health_sources: [],
      health_daily: [],
    },
  });
}

interface GalleryView {
  readonly flow: GalleryFlow;
  readonly chooseFirst: () => void;
}

function Reader({
  onAdd,
  observe,
}: {
  readonly onAdd: (request: GalleryAdd) => void;
  readonly observe: (view: GalleryView) => void;
}): null {
  const { state: pickerState, read: readPicker } = usePickerSource();
  const items = galleryItems([DEVICE_GROUP_WIDGET], [], 'compact', pickerState);
  const flow = useGalleryFlow({
    board: 'compact',
    items,
    placed: [],
    pickerState,
    readPicker,
    onAdd,
  });
  useEffect(() => {
    observe({
      flow,
      chooseFirst: () => {
        const item = items[0];
        if (item === undefined) throw new Error('Expected a group gallery entry');
        const row = targetByKey(item, pickerState, [], `group:${GROUP.id}`);
        if (row === null) throw new Error('Expected the first group target');
        flow.open(item);
        flow.pick(row);
      },
    });
  }, [flow, items, observe, pickerState]);
  return null;
}

let frames: (() => void)[] = [];

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: () => void): number => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function mount(groups: readonly DeviceGroupRow[]): Promise<{
  readonly store: EntityStore;
  readonly latest: () => GalleryView;
  readonly added: readonly GalleryAdd[];
  readonly close: () => void;
}> {
  const store = new EntityStore();
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  const views: GalleryView[] = [];
  const added: GalleryAdd[] = [];
  await act(() => {
    store.replace(snapshotOf(1, groups));
    root.render(
      createElement(StoreProvider, {
        runtime: { store, ledger: new CommandLedger(store) },
        children: createElement(Reader, {
          onAdd: (request) => {
            added.push(request);
          },
          observe: (view) => {
            views.push(view);
          },
        }),
      }),
    );
    return Promise.resolve();
  });
  return {
    store,
    added,
    latest: () => {
      const view = views.at(-1);
      if (view === undefined) throw new Error('Expected the gallery to render');
      return view;
    },
    close: () =>
      act(() => {
        root.unmount();
      }),
  };
}

describe('Home gallery under live target changes', () => {
  it('rejects an Add from the previous render and returns to Browse after a live deletion', async () => {
    const { store, latest, added, close } = await mount([GROUP]);
    act(latest().chooseFirst);
    const selected = latest().flow;
    expect(selected.picked?.key).toBe(`group:${GROUP.id}`);
    act(() => {
      store.apply([
        LIVE_CHANGE.parse({
          type: 'change',
          table: 'device_groups',
          operation: 'DELETE',
          seq: 2,
          record: null,
          oldRecord: GROUP,
        }),
      ]);
      selected.addPicked();
      frames.splice(0).forEach((callback) => {
        callback();
      });
    });
    expect(added).toEqual([]);
    expect(latest().flow.step).toBeNull();
    close();
  });

  it('clears a revoked selection when the scoped snapshot still contains another target', async () => {
    const { store, latest, added, close } = await mount([GROUP, OTHER_GROUP]);
    act(latest().chooseFirst);
    const selected = latest().flow;
    await act(() => {
      store.replace(snapshotOf(2, [OTHER_GROUP]));
      selected.addPicked();
      return Promise.resolve();
    });
    expect(added).toEqual([]);
    expect(latest().flow.step?.entry.title).toBe('Device group');
    expect(latest().flow.picked).toBeNull();
    await act(() => {
      store.replace(snapshotOf(3, [GROUP, OTHER_GROUP]));
      return Promise.resolve();
    });
    expect(latest().flow.picked).toBeNull();
    act(latest().chooseFirst);
    act(latest().flow.addPicked);
    expect(added).toEqual([
      {
        type: 'device-group',
        size: 'XL',
        options: { target: { kind: 'group', groupId: GROUP.id } },
      },
    ]);
    close();
  });
});
