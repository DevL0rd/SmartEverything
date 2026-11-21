import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DEVICE_ROW, SNAPSHOT, type LiveChange, type Snapshot } from '@smarteverything/domain';
import { EMPTY_LATER_TABLES } from './snapshot-fixture';
import { wired } from '../test-support/live-wire';

const disk = vi.hoisted((): { items: Map<string, string>; puts: number } => ({
  items: new Map(),
  puts: 0,
}));

vi.mock('idb-keyval', () => ({
  getMany: (keys: readonly string[]): Promise<(string | undefined)[]> =>
    Promise.resolve(keys.map((key) => disk.items.get(key))),
  setMany: (entries: readonly (readonly [string, string])[]): Promise<void> => {
    entries.forEach(([key, value]) => disk.items.set(key, value));
    disk.puts += entries.length;
    return Promise.resolve();
  },
  delMany: (keys: readonly string[]): Promise<void> => {
    keys.forEach((key) => disk.items.delete(key));
    return Promise.resolve();
  },
}));

const app = vi.hoisted((): { listener: ((state: string) => void) | null } => ({ listener: null }));

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (
      _event: string,
      listener: (state: string) => void,
    ): { remove: () => void } => {
      app.listener = listener;
      return { remove: (): void => undefined };
    },
  },
}));

vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '4.2.0' } } }));

const { persistSnapshots, restoreSnapshot } = await import('./persistence');
const { EntityStore } = await import('./entity-store');
const { touchBegan, touchEnded } = await import('../design/touch-activity');

const SERVER = 'https://hub.test';
const CLIENT = '00000000-0000-4000-8000-000000000001';
const DEVICE = '00000000-0000-4000-8000-000000000002';
const DEVICE_ROW_FIXTURE = {
  id: DEVICE,
  provider: 'xiaomi',
  external_id: 'lamp-1',
  parent_id: null,
  kind: 'light',
  name: 'Lamp',
  display_name: 'Desk lamp',
  model: 'm',
  manufacturer: 'x',
  provider_room: null,
  room_id: null,
  online: true,
  capabilities: [],
  details: {},
  hidden: false,
  favourite: false,
  position: 0,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
};

const OTHER_DEVICES = Array.from({ length: 40 }, (_, index) => ({
  ...DEVICE_ROW_FIXTURE,
  id: `00000000-0000-4000-8000-1000000000${String(index).padStart(2, '0')}`,
  external_id: `plug-${String(index)}`,
  name: `Plug ${String(index)}`,
  display_name: null,
  position: index + 1,
}));

function withDevices(snapshot: Snapshot, devices: readonly unknown[]): Snapshot {
  return SNAPSHOT.parse({ ...snapshot, tables: { ...snapshot.tables, devices } });
}

function deviceChange(seq: number, operation: 'UPDATE' | 'DELETE', online: boolean): LiveChange {
  const row = DEVICE_ROW.parse({
    ...DEVICE_ROW_FIXTURE,
    online,
    updated_at: '2026-10-02T00:00:00.000Z',
  });
  return {
    type: 'change',
    table: 'devices',
    operation,
    record: operation === 'DELETE' ? null : row,
    oldRecord: operation === 'DELETE' ? row : null,
    seq,
  };
}

function snapshotOf(role: 'owner' | 'member', seq: number, room = 'Kitchen'): Snapshot {
  return SNAPSHOT.parse({
    seq,
    session: {
      client: {
        id: CLIENT,
        name: 'Phone',
        platform: 'android',
        role,
        built_in: false,
        created_at: '2026-10-01T00:00:00.000Z',
        last_seen_at: null,
      },
      hub: { version: '1.0.0', startedAt: '2026-10-01T00:00:00.000Z', cameras: 'running' },
    },
    firewall: {
      checkedAt: '2026-10-01T00:00:00.000Z',
      backend: 'ufw',
      filtering: true,
      detail: 'ok',
      openings: [],
      plan: null,
      cameras: [],
    },
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
        updated_at: '2026-10-01T00:00:00.000Z',
      },
      rooms: [{ id: CLIENT, name: room, position: 0 }],
      devices: [DEVICE_ROW_FIXTURE],
      device_state: [
        {
          device_id: DEVICE,
          capability: 'power',
          value: true,
          observed_at: '2026-10-16T10:00:00.000Z',
        },
      ],
      cameras: [],
      automations: [],
      provider_links: [],
      ir_remotes: [],
      ir_codes: [],
      layouts: [],
      events: [],
      commands: [],
      recordings: [],
      ...EMPTY_LATER_TABLES,
    },
    owner:
      role === 'owner'
        ? { clients: [], push_targets: [], mcp_tokens: [], oauth_clients: [] }
        : null,
  });
}

function storedKeys(): string[] {
  return [...disk.items.keys()].map((key) =>
    key.replace(/^smarteverything\.snapshot\.[a-z0-9]+\./, ''),
  );
}

function stored(name: string): unknown {
  const entry = [...disk.items.entries()].find(([key]) => key.endsWith(`.${name}`));
  return entry === undefined ? undefined : JSON.parse(entry[1]);
}

function storedRows(name: string): unknown {
  const order = z.array(z.string()).parse(stored(name));
  return order.map((id): unknown => {
    const entry = [...disk.items.entries()].find(([key]) => key.endsWith(`.${name}.${id}`));
    return entry === undefined ? undefined : JSON.parse(entry[1]);
  });
}

async function persisting(store: InstanceType<typeof EntityStore>): Promise<() => void> {
  const stop = persistSnapshots(SERVER, store);
  await vi.advanceTimersByTimeAsync(0);
  return stop;
}

function storedMeta(): { version: unknown; seq: number } {
  return z
    .looseObject({
      version: z.unknown(),
      seq: z.number(),
    })
    .parse(stored('meta'));
}

const SETTLE_MS = 3000;

function settle(): void {
  vi.advanceTimersByTime(SETTLE_MS);
  vi.advanceTimersByTime(1000);
}

describe('persistSnapshots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 0));
    disk.items.clear();
    disk.puts = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('writes nothing before the first snapshot has arrived', async () => {
    const store = new EntityStore();
    const stop = await persisting(store);
    store.setSync({ status: 'live' });
    vi.advanceTimersByTime(60_000);
    expect(disk.items.size).toBe(0);
    stop();
  });

  it('writes three seconds after the change, once for a burst, one key per table', async () => {
    const store = new EntityStore();
    const stop = await persisting(store);
    store.replace(snapshotOf('owner', 5));
    store.setSync({ status: 'live' });
    vi.advanceTimersByTime(SETTLE_MS - 1);
    expect(disk.items.size).toBe(0);
    settle();
    expect(storedMeta().seq).toBe(5);
    expect(storedKeys()).toEqual(
      expect.arrayContaining(['meta', 'state', 'device_state', 't.rooms', 'o.clients']),
    );
    expect(storedKeys()).not.toContain('t.commands');
    stop();
  });

  it('still writes the cache while the firewall section is unreadable', async () => {
    const store = new EntityStore();
    const stop = await persisting(store);
    store.replace({ ...snapshotOf('owner', 5), firewall: null });
    settle();
    expect(storedMeta().seq).toBe(5);
    expect(storedKeys()).toContain('t.rooms');
    stop();
  });

  it('holds the write while a finger is down and for a moment after it lifts', async () => {
    vi.setSystemTime(1_000_000);
    const store = new EntityStore();
    const stop = await persisting(store);
    store.replace(snapshotOf('owner', 5));
    touchBegan();
    vi.advanceTimersByTime(8000);
    expect(disk.items.size).toBe(0);
    touchEnded();
    vi.advanceTimersByTime(1000);
    expect(disk.items.size).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(storedMeta().seq).toBe(5);
    stop();
  });

  it('rewrites only the row that changed', async () => {
    const store = new EntityStore();
    const stop = await persisting(store);
    store.replace(snapshotOf('owner', 5));
    settle();
    disk.items.clear();
    store.replace(snapshotOf('owner', 6, 'Hall'));
    settle();
    expect(storedKeys().sort()).toEqual(['meta', `t.rooms.${CLIENT}`]);
    expect(stored(`t.rooms.${CLIENT}`)).toEqual({ id: CLIENT, name: 'Hall', position: 0 });
    expect(storedMeta().seq).toBe(6);
    stop();
  });

  it('does not serialize a table again while its rows are unchanged', async () => {
    const store = new EntityStore();
    const stop = await persisting(store);
    store.replace(snapshotOf('owner', 5));
    settle();
    const before = [...disk.items.entries()];
    disk.items.clear();
    store.replace(snapshotOf('owner', 6));
    settle();
    expect(disk.items.size).toBe(0);
    expect(before.length).toBeGreaterThan(5);
    stop();
  });

  it('does not write when only unrelated state changed', async () => {
    const store = new EntityStore();
    const stop = await persisting(store);
    store.replace(snapshotOf('owner', 5));
    settle();
    disk.items.clear();
    store.appendLog(['a line of the service log']);
    vi.advanceTimersByTime(60_000);
    expect(disk.items.size).toBe(0);
    stop();
  });

  it('writes device readings at most every twenty seconds and keeps the old seq until they land', async () => {
    const store = new EntityStore();
    const stop = await persisting(store);
    store.replace(snapshotOf('owner', 5));
    settle();
    const changed = snapshotOf('owner', 6, 'Hall');
    store.replace(
      SNAPSHOT.parse({
        ...changed,
        tables: {
          ...changed.tables,
          device_state: [
            {
              device_id: DEVICE,
              capability: 'power',
              value: false,
              observed_at: '2026-10-16T10:00:05.000Z',
            },
          ],
        },
      }),
    );
    settle();
    expect(storedMeta().seq).toBe(5);
    expect(storedRows('device_state')).toEqual([[expect.objectContaining({ value: true })]]);
    expect(storedRows('t.rooms')).toEqual([{ id: CLIENT, name: 'Hall', position: 0 }]);
    vi.advanceTimersByTime(20_000);
    expect(storedRows('device_state')).toEqual([[expect.objectContaining({ value: false })]]);
    expect(storedMeta().seq).toBe(6);
    stop();
  });

  it('flushes every pending change at once when the app leaves the foreground', async () => {
    const store = new EntityStore();
    const stop = await persisting(store);
    store.replace(snapshotOf('owner', 5));
    app.listener?.('background');
    expect(storedMeta().seq).toBe(5);
    expect(stored('t.rooms')).toBeDefined();
    stop();
  });

  it('keeps the owner tables for an owner and leaves them out for a member', async () => {
    const owner = new EntityStore();
    const stopOwner = await persisting(owner);
    owner.replace(snapshotOf('owner', 1));
    settle();
    expect(storedKeys()).toContain('o.clients');
    stopOwner();
    disk.items.clear();
    const member = new EntityStore();
    const stopMember = await persisting(member);
    member.replace(snapshotOf('member', 1));
    settle();
    expect(storedKeys()).not.toContain('o.clients');
    stopMember();
  });

  it('stamps the cache with the app version and keeps every cached list table', async () => {
    const store = new EntityStore();
    const stop = await persisting(store);
    store.replace(snapshotOf('owner', 1));
    settle();
    expect(storedMeta().version).toBe('4.2.0');
    expect(storedKeys()).toEqual(
      expect.arrayContaining(['t.rooms', 't.device_groups', 't.automation_values', 'o.plugins']),
    );
    stop();
  });

  it('stores device rows without the store-only label', async () => {
    const store = new EntityStore();
    const stop = await persisting(store);
    store.replace(snapshotOf('owner', 1));
    settle();
    expect(store.get().tables.devices.rows[0]?.label).toBe('Desk lamp');
    expect(storedRows('t.devices')).toEqual([DEVICE_ROW_FIXTURE]);
    stop();
  });

  it('writes one key when one device of many changes, not the whole devices table', async () => {
    const store = new EntityStore();
    const stop = await persisting(store);
    store.replace(withDevices(snapshotOf('owner', 5), [DEVICE_ROW_FIXTURE, ...OTHER_DEVICES]));
    settle();
    disk.items.clear();
    disk.puts = 0;
    store.apply(wired([deviceChange(6, 'UPDATE', false)]));
    settle();
    expect(storedKeys().sort()).toEqual(['meta', `t.devices.${DEVICE}`]);
    expect(disk.puts).toBe(2);
    expect(stored(`t.devices.${DEVICE}`)).toEqual(
      expect.objectContaining({ id: DEVICE, online: false }),
    );
    expect(storedMeta().seq).toBe(6);
    stop();
  });

  it('deletes the key of a removed device and rewrites only the order', async () => {
    const store = new EntityStore();
    const stop = await persisting(store);
    store.replace(withDevices(snapshotOf('owner', 5), [DEVICE_ROW_FIXTURE, ...OTHER_DEVICES]));
    settle();
    const keysBefore = storedKeys();
    disk.puts = 0;
    store.apply(wired([deviceChange(6, 'DELETE', true)]));
    settle();
    expect(keysBefore).toContain(`t.devices.${DEVICE}`);
    expect(storedKeys()).not.toContain(`t.devices.${DEVICE}`);
    expect(disk.puts).toBe(2);
    expect(storedRows('t.devices')).toHaveLength(OTHER_DEVICES.length);
    stop();
  });

  it('removes rows an earlier run stored that the table no longer holds', async () => {
    const first = new EntityStore();
    const stopFirst = await persisting(first);
    first.replace(withDevices(snapshotOf('owner', 5), [DEVICE_ROW_FIXTURE, ...OTHER_DEVICES]));
    settle();
    stopFirst();
    const second = new EntityStore();
    const stopSecond = await persisting(second);
    second.replace(withDevices(snapshotOf('owner', 7), OTHER_DEVICES));
    settle();
    expect(storedKeys()).not.toContain(`t.devices.${DEVICE}`);
    expect(storedRows('t.devices')).toHaveLength(OTHER_DEVICES.length);
    stopSecond();
  });

  it('writes nothing once stopped', async () => {
    const store = new EntityStore();
    const stop = await persisting(store);
    store.replace(snapshotOf('owner', 1));
    stop();
    vi.advanceTimersByTime(60_000);
    expect(disk.items.size).toBe(0);
  });
});

describe('restoreSnapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 0));
    disk.items.clear();
    disk.puts = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('brings back what was written for the same server, with the device readings', async () => {
    const writer = new EntityStore();
    const stop = await persisting(writer);
    writer.replace(snapshotOf('owner', 9));
    settle();
    stop();
    const reader = new EntityStore();
    await restoreSnapshot(SERVER, reader);
    const state = reader.get();
    expect(state.loaded).toBe(true);
    expect(state.sync.seq).toBe(9);
    expect(state.deviceValues.get(DEVICE)?.['power']?.value).toBe(true);
    expect(state.tables.rooms.rows.map((room) => room.name)).toEqual(['Kitchen']);
  });

  it('restores nothing for another server', async () => {
    const writer = new EntityStore();
    const stop = await persisting(writer);
    writer.replace(snapshotOf('owner', 9));
    settle();
    stop();
    const reader = new EntityStore();
    await restoreSnapshot('https://other.test', reader);
    expect(reader.get().loaded).toBe(false);
  });

  it('discards and deletes a snapshot written by another app version', async () => {
    const writer = new EntityStore();
    const stop = await persisting(writer);
    writer.replace(snapshotOf('owner', 9));
    settle();
    stop();
    const [key, text] = [...disk.items.entries()].find(([k]) => k.endsWith('.meta')) ?? ['', ''];
    disk.items.set(key, text.replace('"version":"4.2.0"', '"version":"4.1.0"'));
    const reader = new EntityStore();
    await restoreSnapshot(SERVER, reader);
    expect(reader.get().loaded).toBe(false);
    expect(disk.items.size).toBe(0);
  });

  it('discards and deletes the whole-table layout of earlier builds', async () => {
    const snapshot = snapshotOf('owner', 9);
    const writer = new EntityStore();
    const stop = await persisting(writer);
    writer.replace(snapshot);
    settle();
    stop();
    const base = ([...disk.items.keys()].find((key) => key.endsWith('.meta')) ?? '').replace(
      /\.meta$/u,
      '',
    );
    disk.items.clear();
    disk.items.set(
      `${base}.meta`,
      JSON.stringify({ version: '4.2.0', seq: 9, session: snapshot.session, tables: {} }),
    );
    disk.items.set(`${base}.t.rooms`, JSON.stringify(snapshot.tables.rooms));
    disk.items.set(`${base}.t.devices`, JSON.stringify(snapshot.tables.devices));
    const reader = new EntityStore();
    await restoreSnapshot(SERVER, reader);
    expect(reader.get().loaded).toBe(false);
    expect(disk.items.size).toBe(0);
  });

  it('discards and deletes the single device_state key of the earlier layout', async () => {
    const snapshot = snapshotOf('owner', 9);
    const writer = new EntityStore();
    const stop = await persisting(writer);
    writer.replace(snapshot);
    settle();
    stop();
    const base = ([...disk.items.keys()].find((key) => key.endsWith('.meta')) ?? '').replace(
      /\.meta$/u,
      '',
    );
    disk.items.set(`${base}.meta`, JSON.stringify({ version: '4.2.0', layout: 'rows', seq: 9 }));
    disk.items.delete(`${base}.device_state.${DEVICE}`);
    disk.items.set(`${base}.device_state`, JSON.stringify(snapshot.tables.device_state));
    const reader = new EntityStore();
    await restoreSnapshot(SERVER, reader);
    expect(reader.get().loaded).toBe(false);
    expect(disk.items.has(`${base}.device_state`)).toBe(false);
  });

  it('discards and deletes a snapshot that is not readable', async () => {
    disk.items.set('smarteverything.snapshot.x', 'not json');
    await restoreSnapshot(SERVER, new EntityStore());
    const reader = new EntityStore();
    await restoreSnapshot(SERVER, reader);
    expect(reader.get().loaded).toBe(false);
  });

  it('does not overwrite state that already loaded from the hub', async () => {
    const writer = new EntityStore();
    const stop = await persisting(writer);
    writer.replace(snapshotOf('owner', 9));
    settle();
    stop();
    const reader = new EntityStore();
    reader.replace(snapshotOf('owner', 20));
    await restoreSnapshot(SERVER, reader);
    expect(reader.get().sync.seq).toBe(20);
  });
});
