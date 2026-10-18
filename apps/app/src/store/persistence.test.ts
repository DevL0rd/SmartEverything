import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SNAPSHOT, type Snapshot } from '@smarteverything/domain';

const disk = vi.hoisted((): { items: Map<string, string> } => ({ items: new Map() }));

vi.mock('idb-keyval', () => ({
  getMany: (keys: readonly string[]): Promise<(string | undefined)[]> =>
    Promise.resolve(keys.map((key) => disk.items.get(key))),
  set: (key: string, value: string): Promise<void> => {
    disk.items.set(key, value);
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

function storedMeta(): { version: unknown; seq: number; tables: Record<string, unknown> } {
  return z
    .looseObject({
      version: z.unknown(),
      seq: z.number(),
      tables: z.record(z.string(), z.unknown()),
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
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('writes nothing before the first snapshot has arrived', () => {
    const store = new EntityStore();
    const stop = persistSnapshots(SERVER, store);
    store.setSync({ status: 'live' });
    vi.advanceTimersByTime(60_000);
    expect(disk.items.size).toBe(0);
    stop();
  });

  it('writes three seconds after the change, once for a burst, one key per table', () => {
    const store = new EntityStore();
    const stop = persistSnapshots(SERVER, store);
    store.replace(snapshotOf('owner', 5));
    store.setSync({ status: 'live' });
    vi.advanceTimersByTime(SETTLE_MS - 1);
    expect(disk.items.size).toBe(0);
    settle();
    expect(storedMeta().seq).toBe(5);
    expect(storedKeys()).toEqual(
      expect.arrayContaining(['meta', 'device_state', 't.rooms', 'o.clients']),
    );
    expect(storedKeys()).not.toContain('t.commands');
    stop();
  });

  it('holds the write while a finger is down and for a moment after it lifts', () => {
    vi.setSystemTime(1_000_000);
    const store = new EntityStore();
    const stop = persistSnapshots(SERVER, store);
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

  it('rewrites only the table that changed', () => {
    const store = new EntityStore();
    const stop = persistSnapshots(SERVER, store);
    store.replace(snapshotOf('owner', 5));
    settle();
    disk.items.clear();
    store.replace(snapshotOf('owner', 6, 'Hall'));
    settle();
    expect(storedKeys().sort()).toEqual(['meta', 't.rooms']);
    expect(stored('t.rooms')).toEqual([{ id: CLIENT, name: 'Hall', position: 0 }]);
    expect(storedMeta().seq).toBe(6);
    stop();
  });

  it('does not serialize a table again while its rows are unchanged', () => {
    const store = new EntityStore();
    const stop = persistSnapshots(SERVER, store);
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

  it('does not write when only unrelated state changed', () => {
    const store = new EntityStore();
    const stop = persistSnapshots(SERVER, store);
    store.replace(snapshotOf('owner', 5));
    settle();
    disk.items.clear();
    store.appendLog(['a line of the service log']);
    vi.advanceTimersByTime(60_000);
    expect(disk.items.size).toBe(0);
    stop();
  });

  it('writes device readings at most every twenty seconds and keeps the old seq until they land', () => {
    const store = new EntityStore();
    const stop = persistSnapshots(SERVER, store);
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
    expect(stored('device_state')).toEqual([expect.objectContaining({ value: true })]);
    expect(stored('t.rooms')).toEqual([{ id: CLIENT, name: 'Hall', position: 0 }]);
    vi.advanceTimersByTime(20_000);
    expect(stored('device_state')).toEqual([expect.objectContaining({ value: false })]);
    expect(storedMeta().seq).toBe(6);
    stop();
  });

  it('flushes every pending change at once when the app leaves the foreground', () => {
    const store = new EntityStore();
    const stop = persistSnapshots(SERVER, store);
    store.replace(snapshotOf('owner', 5));
    app.listener?.('background');
    expect(storedMeta().seq).toBe(5);
    expect(stored('t.rooms')).toBeDefined();
    stop();
  });

  it('keeps the owner tables for an owner and leaves them out for a member', () => {
    const owner = new EntityStore();
    const stopOwner = persistSnapshots(SERVER, owner);
    owner.replace(snapshotOf('owner', 1));
    settle();
    expect(storedKeys()).toContain('o.clients');
    stopOwner();
    disk.items.clear();
    const member = new EntityStore();
    const stopMember = persistSnapshots(SERVER, member);
    member.replace(snapshotOf('member', 1));
    settle();
    expect(storedKeys()).not.toContain('o.clients');
    stopMember();
  });

  it('stamps the cache with the app version and keeps every cached list table', () => {
    const store = new EntityStore();
    const stop = persistSnapshots(SERVER, store);
    store.replace(snapshotOf('owner', 1));
    settle();
    expect(storedMeta().version).toBe('4.2.0');
    expect(storedKeys()).toEqual(
      expect.arrayContaining(['t.rooms', 't.device_groups', 't.automation_values', 'o.plugins']),
    );
    stop();
  });

  it('stores device rows without the store-only label', () => {
    const store = new EntityStore();
    const stop = persistSnapshots(SERVER, store);
    store.replace(snapshotOf('owner', 1));
    settle();
    expect(store.get().tables.devices.rows[0]?.label).toBe('Desk lamp');
    expect(stored('t.devices')).toEqual([DEVICE_ROW_FIXTURE]);
    stop();
  });

  it('writes nothing once stopped', () => {
    const store = new EntityStore();
    const stop = persistSnapshots(SERVER, store);
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
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('brings back what was written for the same server, with the device readings', async () => {
    const writer = new EntityStore();
    const stop = persistSnapshots(SERVER, writer);
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
    const stop = persistSnapshots(SERVER, writer);
    writer.replace(snapshotOf('owner', 9));
    settle();
    stop();
    const reader = new EntityStore();
    await restoreSnapshot('https://other.test', reader);
    expect(reader.get().loaded).toBe(false);
  });

  it('discards and deletes a snapshot written by another app version', async () => {
    const writer = new EntityStore();
    const stop = persistSnapshots(SERVER, writer);
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

  it('discards and deletes a snapshot that is not readable', async () => {
    disk.items.set('smarteverything.snapshot.x', 'not json');
    await restoreSnapshot(SERVER, new EntityStore());
    const reader = new EntityStore();
    await restoreSnapshot(SERVER, reader);
    expect(reader.get().loaded).toBe(false);
  });

  it('does not overwrite state that already loaded from the hub', async () => {
    const writer = new EntityStore();
    const stop = persistSnapshots(SERVER, writer);
    writer.replace(snapshotOf('owner', 9));
    settle();
    stop();
    const reader = new EntityStore();
    reader.replace(snapshotOf('owner', 20));
    await restoreSnapshot(SERVER, reader);
    expect(reader.get().sync.seq).toBe(20);
  });
});
