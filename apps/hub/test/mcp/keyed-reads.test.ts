import {
  PLUGIN_SEARCH_ENTRY,
  type ChatWidget,
  type CommandRow,
  type PluginSearchEntry,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceLabel } from '../../src/ai-tools/create';
import { widgetRejection } from '../../src/chat-widgets/widget-check';
import { systemClock } from '../../src/clock';
import { shotOf } from '../../src/extensions/mcp/tools/camera-live';
import { latestSnapshot } from '../../src/extensions/mcp/tools/camera';
import { reported } from '../../src/extensions/mcp/tools/commanding';
import { scenes } from '../../src/extensions/mcp/tools/control';
import { deviceDetails, foundDevices } from '../../src/extensions/mcp/tools/devices';
import { eventsOf } from '../../src/extensions/mcp/tools/history';
import { peopleOf } from '../../src/extensions/mcp/tools/people';
import { placedDevice } from '../../src/extensions/mcp/tools/targets';
import { searchHitsOf } from '../../src/plugins/search-hits';
import { captureLogs } from '../support/logs';
import { OWNER } from '../support/phone-fixtures';
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
  vi.restoreAllMocks();
  await opened.close();
});

function searchEntry(
  id: string,
  externalId: string,
): { pluginId: string; entry: PluginSearchEntry } {
  return {
    pluginId: 'demo',
    entry: PLUGIN_SEARCH_ENTRY.parse({
      id,
      title: id,
      target: { kind: 'device', externalId },
    }),
  };
}

function pathEntry(id: string): PluginSearchEntry {
  return PLUGIN_SEARCH_ENTRY.parse({ id, title: id, target: { kind: 'path', path: '/plugins' } });
}

function finished(deviceId: string, count: number): CommandRow[] {
  return opened.store.commands.insert(
    Array.from({ length: count }, () => ({
      deviceId,
      capability: 'power',
      value: true,
      source: 'assistant' as const,
      requestedBy: null,
    })),
  );
}

describe('a command report', () => {
  it('names every command from one read of the devices', () => {
    const devices = vi.spyOn(opened.store.devices, 'list');
    const rooms = vi.spyOn(opened.store.rooms, 'list');
    const states = vi.spyOn(opened.store.state, 'list');
    const report = reported(
      { store: opened.store },
      {
        commands: finished(home.lamp.id, 4),
        allFinished: true,
      },
    );
    expect(report['commands']).toHaveLength(4);
    expect(report['commands']).toMatchObject(
      Array.from({ length: 4 }, () => ({ device: 'Desk lamp', now: null })),
    );
    expect(devices).toHaveBeenCalledTimes(1);
    expect(rooms).not.toHaveBeenCalled();
    expect(states).not.toHaveBeenCalled();
  });

  it('gives no device name to a command that targets no device', () => {
    const [command] = opened.store.commands.insert([
      {
        deviceId: null,
        capability: 'hub:record_clip',
        value: {},
        source: 'assistant',
        requestedBy: null,
      },
    ]);
    const report = reported(
      { store: opened.store },
      {
        commands: command ? [command] : [],
        allFinished: true,
      },
    );
    expect(report['commands']).toMatchObject([{ device_id: null, device: null, now: null }]);
  });
});

describe('scene listing', () => {
  it('names each action device from one read of the devices', () => {
    opened.store.scenes.create({
      name: 'Evening',
      icon: 'moon',
      position: 0,
      actions: [
        { type: 'command', deviceId: home.lamp.id, capability: 'power', value: true },
        { type: 'command', deviceId: home.camera.id, capability: 'privacy_mode', value: true },
        { type: 'command', deviceId: home.lamp.id, capability: 'power', value: false },
      ],
    });
    const devices = vi.spyOn(opened.store.devices, 'list');
    const listed = scenes({ store: opened.store });
    expect(listed).toMatchObject([
      {
        actions: [{ device: 'Desk lamp' }, { device: 'Front door' }, { device: 'Desk lamp' }],
      },
    ]);
    expect(devices).toHaveBeenCalledTimes(1);
  });
});

describe('device details', () => {
  it('reads the state and camera of just that device', () => {
    opened.store.state.write([
      {
        deviceId: home.lamp.id,
        capability: 'power',
        value: true,
        observedAt: '2026-10-08T10:00:00.000Z',
      },
      {
        deviceId: home.camera.id,
        capability: 'privacy_mode',
        value: false,
        observedAt: '2026-10-08T10:00:00.000Z',
      },
    ]);
    const all = vi.spyOn(opened.store.state, 'list');
    const cameras = vi.spyOn(opened.store.cameras, 'list');
    const ofDevice = vi.spyOn(opened.store.state, 'ofDevice');
    const details = deviceDetails(
      opened.store,
      null,
      OWNER,
      placedDevice(opened.store, null, home.lamp.id),
    );
    expect(details['capabilities']).toMatchObject([{ key: 'power', value: true }]);
    expect(all).not.toHaveBeenCalled();
    expect(cameras).not.toHaveBeenCalled();
    expect(ofDevice).toHaveBeenCalledExactlyOnceWith(home.lamp.id);
  });

  it('describes every device of a detailed listing from one read of the devices', () => {
    const devices = vi.spyOn(opened.store.devices, 'list');
    const found = foundDevices(opened.store, null, OWNER, {
      includeHidden: false,
      limit: 200,
      detail: true,
      search: 'door',
    });
    expect(found).toHaveLength(2);
    expect(found).toSatisfy(
      (entries: unknown) =>
        Array.isArray(entries) && entries.every((entry) => 'capabilities' in entry),
    );
    expect(devices).toHaveBeenCalledTimes(1);
  });

  it('names an unknown device in the refusal without scanning the devices', () => {
    const devices = vi.spyOn(opened.store.devices, 'list');
    expect(() => placedDevice(opened.store, null, '0d000000-0000-4000-8000-000000000001')).toThrow(
      /There is no device/,
    );
    expect(devices).not.toHaveBeenCalled();
  });
});

describe('the newest saved snapshot', () => {
  it('is found with one query however many clips are newer', () => {
    opened.store.cameras.addRecording({
      deviceId: home.camera.id,
      eventId: null,
      kind: 'snapshot',
      storagePath: 'old.jpg',
      startedAt: '2026-10-01T10:00:00.000Z',
      durationMs: null,
      bytes: 10,
    });
    for (let index = 0; index < 130; index += 1) {
      opened.store.cameras.addRecording({
        deviceId: home.camera.id,
        eventId: null,
        kind: 'clip',
        storagePath: `clip-${String(index)}.mp4`,
        startedAt: `2026-10-02T10:${String(index % 60).padStart(2, '0')}:00.000Z`,
        durationMs: 5000,
        bytes: 10,
      });
    }
    const query = vi.spyOn(opened.store.cameras, 'recordings');
    expect(latestSnapshot(opened.store, home.camera.id).storage_path).toBe('old.jpg');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('says so when the camera has none', () => {
    expect(() => latestSnapshot(opened.store, home.camera.id)).toThrow(/no saved snapshot/);
  });
});

describe('a live camera look', () => {
  function context(): Parameters<typeof shotOf>[0] {
    return {
      store: opened.store,
      hub: { snapshot: () => Promise.resolve(new Uint8Array([1, 2, 3])) },
      clock: systemClock,
    };
  }

  function write(value: boolean): void {
    opened.store.state.write([
      {
        deviceId: home.camera.id,
        capability: 'privacy_mode',
        value,
        observedAt: '2026-10-08T10:00:00.000Z',
      },
    ]);
  }

  it('is withheld while the camera privacy mode is on, without reading all device state', async () => {
    write(true);
    const all = vi.spyOn(opened.store.state, 'list');
    const shot = await shotOf(context(), placedDevice(opened.store, null, home.camera.id), 'full');
    expect(shot.item).toMatchObject({ status: 'privacy_on' });
    expect(shot.image).toBeNull();
    expect(all).not.toHaveBeenCalled();
  });

  it('is taken while the privacy mode is off', async () => {
    write(false);
    const shot = await shotOf(context(), placedDevice(opened.store, null, home.camera.id), 'full');
    expect(shot.item).toMatchObject({ status: 'ok' });
    expect(shot.image?.data).toBe(Buffer.from([1, 2, 3]).toString('base64'));
  });
});

describe('the events listing', () => {
  it('loads the recordings of all listed events in one query', () => {
    const rows = opened.store.events.insert(
      (['motion', 'person', 'sound'] as const).map((kind, index) => ({
        deviceId: home.camera.id,
        kind,
        occurredAt: `2026-10-08T10:0${String(index)}:00.000Z`,
        details: {},
      })),
    );
    const [first, second] = rows;
    for (const [event, kind] of [
      [first, 'snapshot'],
      [first, 'clip'],
      [second, 'snapshot'],
    ] as const) {
      opened.store.cameras.addRecording({
        deviceId: home.camera.id,
        eventId: event?.id ?? null,
        kind,
        storagePath: `${kind}-${event?.id ?? ''}`,
        startedAt: '2026-10-08T10:00:00.000Z',
        durationMs: null,
        bytes: 1,
      });
    }
    const batched = vi.spyOn(opened.store.cameras, 'recordingsOfEvents');
    const single = vi.spyOn(opened.store.cameras, 'recordingsOfEvent');
    const listed = eventsOf(opened.store, null, OWNER, { limit: 50 });
    expect(listed).toHaveLength(3);
    const counts = new Map(
      listed.map((entry) => [
        String(entry['id']),
        Array.isArray(entry['recordings']) ? entry['recordings'].length : -1,
      ]),
    );
    expect([first?.id, second?.id, rows[2]?.id].map((id) => counts.get(id ?? ''))).toEqual([
      2, 1, 0,
    ]);
    expect(batched).toHaveBeenCalledTimes(1);
    expect(single).not.toHaveBeenCalled();
  });
});

describe('the people listing', () => {
  it('attaches each app to its person without a lookup per app', () => {
    const robin = opened.store.profiles.create({ name: 'Robin' });
    const client = opened.store.clients.create({
      name: 'Robin phone',
      platform: 'android',
      role: 'member',
      tokenHash: 'a'.repeat(64),
    });
    opened.store.clients.useProfile(client.id, robin.id);
    const active = vi.spyOn(opened.store.profiles, 'activeOf');
    const people = peopleOf(opened.store);
    expect(people.find((person) => person['id'] === robin.id)).toMatchObject({
      apps: [{ id: client.id, name: 'Robin phone' }],
    });
    expect(active).not.toHaveBeenCalled();
  });
});

describe('the assistant tool line device label', () => {
  it('reads one device and one room, and is null for an unknown device', () => {
    const devices = vi.spyOn(opened.store.devices, 'list');
    const rooms = vi.spyOn(opened.store.rooms, 'list');
    expect(deviceLabel(opened.store, home.lamp.id)).toBe('study desk lamp');
    expect(deviceLabel(opened.store, '0d000000-0000-4000-8000-000000000001')).toBeNull();
    expect(devices).not.toHaveBeenCalled();
    expect(rooms).not.toHaveBeenCalled();
  });
});

describe('chat widget checks', () => {
  const viewer = { profileId: '0d000000-0000-4000-8000-000000000002', now: 0 };

  it('look a device up by id', () => {
    const devices = vi.spyOn(opened.store.devices, 'list');
    const widgets: ChatWidget[] = [
      { kind: 'device', id: home.lamp.id },
      { kind: 'camera', id: home.camera.id },
      { kind: 'device_settings_link', id: home.lamp.id, value: null },
    ];
    expect(widgets.map((widget) => widgetRejection(opened.store, widget, viewer))).toEqual([
      null,
      null,
      null,
    ]);
    expect(devices).not.toHaveBeenCalled();
  });

  it('refuse an unknown device, a hidden device and the wrong kind', () => {
    opened.store.devices.update(home.other.id, { hidden: true });
    expect(widgetRejection(opened.store, { kind: 'device', id: home.other.id }, viewer)).toMatch(
      /There is no device/,
    );
    expect(widgetRejection(opened.store, { kind: 'device', id: home.camera.id }, viewer)).toMatch(
      /is a camera/,
    );
    expect(
      widgetRejection(
        opened.store,
        { kind: 'device_settings_link', id: '0d000000-0000-4000-8000-000000000001', value: null },
        viewer,
      ),
    ).toMatch(/There is no device settings/);
  });
});

describe('plugin search hits', () => {
  it('resolve every device entry from one read of the devices', () => {
    const [local] = opened.store.devices.upsert([
      {
        provider: 'local',
        externalId: 'pixel',
        parentId: null,
        kind: 'phone',
        name: 'Pixel',
        model: 'pixel',
        manufacturer: 'Google',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [],
        details: {},
      },
    ]);
    const devices = vi.spyOn(opened.store.devices, 'list');
    const hits = searchHitsOf({
      devices: opened.store.devices,
      pluginData: {
        searchEntries: () => [
          searchEntry('a', 'pixel'),
          searchEntry('b', 'pixel'),
          searchEntry('c', 'gone'),
          { pluginId: 'demo', entry: pathEntry('d') },
        ],
      },
    });
    expect(hits.map((hit) => hit.id)).toEqual(['demo:a', 'demo:b', 'demo:d']);
    expect(hits[0]?.path).toBe(`/device/${local?.id ?? ''}`);
    expect(devices).toHaveBeenCalledTimes(1);
  });
});
