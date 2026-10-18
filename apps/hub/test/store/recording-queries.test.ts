import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { furnishHome, type ToolHome } from '../support/tool-home';

let opened: TestStore;
let home: ToolHome;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  home = furnishHome(opened.store);
});

afterEach(async () => {
  await opened.close();
});

function add(
  deviceId: string,
  kind: 'snapshot' | 'clip',
  startedAt: string,
  eventId: string | null = null,
): string {
  return opened.store.cameras.addRecording({
    deviceId,
    eventId,
    kind,
    storagePath: `${kind}-${startedAt}`,
    startedAt,
    durationMs: null,
    bytes: 1,
  }).id;
}

describe('recordings by kind', () => {
  it('lists only the asked kind, newest first, within the other filters', () => {
    const oldSnapshot = add(home.camera.id, 'snapshot', '2026-10-01T10:00:00.000Z');
    add(home.camera.id, 'clip', '2026-10-02T10:00:00.000Z');
    const newSnapshot = add(home.camera.id, 'snapshot', '2026-10-03T10:00:00.000Z');
    add(home.other.id, 'snapshot', '2026-10-04T10:00:00.000Z');
    const ids = (kind?: 'snapshot' | 'clip'): string[] =>
      opened.store.cameras
        .recordings({ deviceIds: [home.camera.id], kind, limit: 10 })
        .map((row) => row.id);
    expect(ids('snapshot')).toEqual([newSnapshot, oldSnapshot]);
    expect(ids('clip')).toHaveLength(1);
    expect(ids()).toHaveLength(3);
    expect(
      opened.store.cameras
        .recordings({ deviceIds: [home.camera.id], kind: 'snapshot', limit: 1 })
        .map((row) => row.id),
    ).toEqual([newSnapshot]);
  });
});

function eventIds(): readonly [string, string, string] {
  const [first, second, third] = opened.store.events.insert(
    (['motion', 'person', 'sound'] as const).map((kind, index) => ({
      deviceId: home.camera.id,
      kind,
      occurredAt: `2026-10-08T10:0${String(index)}:00.000Z`,
      details: {},
    })),
  );
  if (first === undefined || second === undefined || third === undefined) {
    throw new Error('the events were not stored');
  }
  return [first.id, second.id, third.id];
}

describe('recordings of several events', () => {
  it('come back together, in the order they were added', () => {
    const [first, second, third] = eventIds();
    const a = add(home.camera.id, 'snapshot', '2026-10-08T10:00:00.000Z', first);
    const b = add(home.camera.id, 'clip', '2026-10-08T10:00:01.000Z', second);
    const c = add(home.camera.id, 'clip', '2026-10-08T10:00:02.000Z', first);
    add(home.camera.id, 'clip', '2026-10-08T10:00:03.000Z', third);
    const rows = opened.store.cameras.recordingsOfEvents([first, second]);
    expect(rows.map((row) => row.id)).toEqual([a, b, c]);
    expect(opened.store.cameras.recordingsOfEvent(second).map((row) => row.id)).toEqual([b]);
  });

  it('are none for no events', () => {
    expect(opened.store.cameras.recordingsOfEvents([])).toEqual([]);
  });
});

describe('devices by provider identity', () => {
  it('finds the one device of that provider and external id', () => {
    expect(opened.store.devices.byExternal('xiaomi', 'camera-1')?.id).toBe(home.camera.id);
    expect(opened.store.devices.byExternal('tuya', 'camera-1')).toBeUndefined();
    expect(opened.store.devices.byExternal('xiaomi', 'missing')).toBeUndefined();
  });
});
