import { PLUGIN_MANIFEST, type JsonValue, type PluginDataPoint } from '@smarteverything/domain';
import {
  SHELLY_SNAPSHOT,
  SHELLY_SNAPSHOT_STREAM,
  SHELLY_TRACKS,
  SHELLY_TRACKS_STREAM,
  type ShellyDevice,
} from '@smarteverything/shelly';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contributionsOf } from '../../../src/plugins/contributions';
import { shellyPresencePlugin } from '../../../src/plugins/builtin/shelly-presence';
import { ShellyPublisher } from '../../../src/plugins/builtin/shelly-presence/publisher';
import { testStore, type TestStore } from '../../support/store';
import { DEVICE_ID } from './fake-shelly';
import { sensorFixture } from './sensor-fixture';

function sensor(overrides: Partial<ShellyDevice> = {}): ShellyDevice {
  return { ...sensorFixture(), ...overrides };
}

interface Published {
  readonly published: { stream: string; value: JsonValue }[];
  readonly searches: ReturnType<typeof vi.fn>;
  readonly publisher: ShellyPublisher;
}

function publisher(devices: () => readonly ShellyDevice[]): Published {
  const published: { stream: string; value: JsonValue }[] = [];
  const searches = vi.fn();
  const ports = {
    data: {
      publish: (stream: string, value: JsonValue): void => {
        published.push({ stream, value });
      },
    },
    search: { replace: searches },
  };
  return { published, searches, publisher: new ShellyPublisher(ports, devices) };
}

const tick = (): Promise<void> => Promise.resolve();

describe('Shelly publisher', () => {
  it('publishes the inventory once for a burst and skips an unchanged inventory', async () => {
    const fixed = sensor();
    const { published, publisher: shelly } = publisher(() => [fixed]);
    for (let index = 0; index < 50; index += 1) shelly.inventoryChanged(false);
    await tick();
    shelly.inventoryChanged(false);
    await tick();
    expect(published.filter((entry) => entry.stream === SHELLY_SNAPSHOT_STREAM)).toHaveLength(1);
  });

  it('reindexes search only when asked to', async () => {
    const { searches, publisher: shelly } = publisher(() => [sensor()]);
    shelly.inventoryChanged(false);
    await tick();
    expect(searches).not.toHaveBeenCalled();
    shelly.inventoryChanged(true);
    await tick();
    expect(searches).toHaveBeenCalledTimes(1);
  });

  it('keeps tracks out of the inventory and sends them on their own stream', async () => {
    const track = { id: 1, x: 1, y: 2, z: 0.4 };
    const live = sensor({ tracks: [track], tracksAt: '2026-10-16T10:00:00.000Z' });
    const { published, publisher: shelly } = publisher(() => [live]);
    shelly.tracksChanged(live);
    shelly.tracksChanged(live);
    shelly.inventoryChanged(false);
    await tick();
    const inventory = published.find((entry) => entry.stream === SHELLY_SNAPSHOT_STREAM);
    expect(SHELLY_SNAPSHOT.parse(inventory?.value).devices[0]?.tracks).toEqual([]);
    const frames = published.filter((entry) => entry.stream === SHELLY_TRACKS_STREAM);
    expect(frames).toHaveLength(1);
    expect(SHELLY_TRACKS.parse(frames[0]?.value).devices).toEqual([
      { id: DEVICE_ID, tracks: [track], tracksAt: '2026-10-16T10:00:00.000Z' },
    ]);
  });

  it('clears the track frame when tracking ends and ignores queued work after stop', async () => {
    const live = sensor({ tracks: [], tracksAt: '2026-10-16T10:00:00.000Z' });
    const { published, publisher: shelly } = publisher(() => [live]);
    shelly.tracksChanged(live);
    shelly.tracksChanged({ ...live, tracksAt: null });
    shelly.inventoryChanged(false);
    shelly.stop();
    const before = published.length;
    await tick();
    expect(SHELLY_TRACKS.parse(published[1]?.value).devices).toEqual([]);
    expect(published.length).toBe(before);
  });
});

describe('Shelly streams in the store', () => {
  let store: TestStore | null = null;
  afterEach(async () => {
    await store?.close();
    store = null;
  });

  it('persists the inventory but only broadcasts track frames', async () => {
    store = await testStore();
    const changes: { table: string; operation: string }[] = [];
    store.store.feed.subscribe((change) => {
      changes.push({ table: change.table, operation: change.operation });
    });
    const manifest = PLUGIN_MANIFEST.parse(shellyPresencePlugin.manifest);
    store.store.plugins.create({ manifest, source: 'builtin', location: 'builtin', trusted: true });
    const { sinks } = contributionsOf(
      {
        store: store.store,
        signals: { emit: vi.fn(), register: vi.fn() },
        inbound: vi.fn(),
        now: () => new Date('2026-10-16T10:00:00.000Z'),
      },
      manifest,
      vi.fn(),
    );
    const point = (stream: string, value: JsonValue): PluginDataPoint => ({
      stream,
      value,
      at: '2026-10-16T10:00:00.000Z',
    });
    sinks.data(point(SHELLY_SNAPSHOT_STREAM, { devices: [] }));
    for (let index = 0; index < 20; index += 1)
      sinks.data(point(SHELLY_TRACKS_STREAM, { devices: [], index }));
    expect(store.store.pluginData.streams()).toHaveLength(0);
    expect(store.store.pluginData.history(manifest.id, SHELLY_SNAPSHOT_STREAM, 10)).toHaveLength(1);
    expect(store.store.pluginData.history(manifest.id, SHELLY_TRACKS_STREAM, 10)).toHaveLength(0);
    const streamChanges = changes.filter((change) => change.table === 'plugin_streams');
    expect(streamChanges).toHaveLength(21);
    expect(streamChanges[1]?.operation).toBe('INSERT');
    expect(streamChanges[2]?.operation).toBe('UPDATE');
  });
});
