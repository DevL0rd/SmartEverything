import type { DeviceCapability, DeviceRow, RoomRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { voiceResponseOf } from '../../src/assistant-voice/voice-results';
import { VOICE_PAGE, voiceArgumentsOf, voiceSpecOf } from '../../src/assistant-voice/voice-shapes';
import { AUTOMATION_FILTER, listAutomations } from '../../src/extensions/mcp/tools/automation-list';
import { DEVICE_FILTER, listDevices } from '../../src/extensions/mcp/tools/devices';
import { captureLogs, type CapturedLogs } from '../support/logs';
import { node, saveAutomation, trigger } from '../support/automation-fixture';
import { testStore, type TestStore } from '../support/store';

const VOICE_BUDGET = 8_000;

const ROOMS = [
  'Living room',
  'Kitchen',
  'Dining room',
  'Guest Room',
  'Master bedroom',
  'Outside',
  'Laundry',
  'Study',
];

const KINDS = ['light', 'switch', 'sensor', 'plug', 'fan', 'speaker'];

const CAPABILITIES: readonly DeviceCapability[] = (
  [
    'power',
    'child_lock',
    'raw:brightness_level',
    'raw:color_tone',
    'raw:scene_switch',
    'raw:indicator_light',
    'raw:power_on_state',
    'raw:countdown',
    'raw:do_not_disturb',
    'raw:night_light',
  ] as const
).map((key) => ({ key, label: key, access: 'read_write', value: { kind: 'boolean' } }));

const DEVICE_COUNT = 72;
const AUTOMATION_COUNT = 37;

let opened: TestStore;
let logs: CapturedLogs;
let rooms: RoomRow[];
let devices: DeviceRow[];

function at<T>(items: readonly T[], index: number): T {
  const item = items[index % items.length];
  if (item === undefined) throw new Error('empty fixture list');
  return item;
}

function furnish(): void {
  rooms = ROOMS.map((name, position) => opened.store.rooms.create(name, position));
  devices = opened.store.devices.upsert(
    Array.from({ length: DEVICE_COUNT }, (_, index) => {
      const room = at(rooms, index);
      const kind = at(KINDS, Math.floor(index / ROOMS.length));
      return {
        provider: 'xiaomi' as const,
        externalId: `device-${String(index)}`,
        parentId: null,
        kind,
        name: `${room.name} ${kind} ${String(Math.floor(index / ROOMS.length) + 1)}`,
        model: `yeelink.${kind}.model${String(index)}`,
        manufacturer: 'Yeelight',
        providerRoom: null,
        roomId: room.id,
        online: index % 9 !== 0,
        capabilities: CAPABILITIES,
        details: { ip: `10.0.0.${String(index)}`, token: 'x'.repeat(32) },
      };
    }),
  );
  for (let index = 0; index < AUTOMATION_COUNT; index += 1) {
    const watched = at(devices, index);
    const changed = at(devices, index + ROOMS.length);
    const room = at(rooms, index);
    saveAutomation(opened.store, {
      name: `${room.name} switch - press cycles brightness ${String(index)}`,
      enabled: index % 4 !== 0,
      triggers: [
        trigger('trigger.signal', {
          source: 'device',
          kind: 'state',
          subject: watched.id,
          field: 'power',
          test: { is: 'eq', to: true },
        }),
      ],
      body: Array.from({ length: 6 }, (_, step) =>
        node('device.set', {
          target: { device: changed.id },
          control: 'brightness',
          to: step * 20,
        }),
      ),
    });
  }
}

beforeEach(async () => {
  logs = captureLogs();
  opened = await testStore();
  furnish();
});

afterEach(async () => {
  await opened.close();
});

type Json = Readonly<Record<string, unknown>>;

const ROWS = z.array(z.record(z.string(), z.unknown()));
const MORE = z.object({ total: z.number(), next_offset: z.number(), ask: z.string() });
const INNER = z.object({ arguments: z.record(z.string(), z.unknown()) });

function reach(): { store: TestStore['store']; actor: null } {
  return { store: opened.store, actor: null };
}

function chatDevices(args: Json): Json {
  return listDevices(reach(), DEVICE_FILTER.parse(args));
}

function chatAutomations(args: Json): Json {
  return listAutomations(reach(), AUTOMATION_FILTER.parse(args));
}

function voiceFind(args: Json): Json {
  const asked = voiceArgumentsOf('find_devices', args);
  return voiceResponseOf('find_devices', asked, chatDevices(asked));
}

function voiceAutomations(args: Json): Json {
  const call = voiceArgumentsOf('call_tool', { name: 'list_automations', arguments: args });
  return voiceResponseOf('call_tool', call, chatAutomations(INNER.parse(call).arguments));
}

function rows(result: Json, key: string): Record<string, unknown>[] {
  return ROWS.parse(result[key]);
}

function size(result: unknown): number {
  return JSON.stringify(result).length;
}

describe('voice tool results for a home of 72 devices and 37 automations', () => {
  it('keeps the full device list for text chats', () => {
    const full = chatDevices({});
    expect(rows(full, 'devices')).toHaveLength(DEVICE_COUNT);
    expect(full['more']).toBeUndefined();
    expect(size(full)).toBeGreaterThan(VOICE_BUDGET * 3);
  });

  it('pages find_devices in a bounded summary and every page together covers the home', () => {
    const seen = new Set<unknown>();
    let offset: number | undefined = 0;
    while (offset !== undefined) {
      const page = voiceFind({ offset });
      expect(size(page)).toBeLessThan(VOICE_BUDGET);
      for (const device of rows(page, 'devices')) {
        expect(Object.keys(device).sort()).toEqual(['family', 'id', 'name', 'online', 'room']);
        seen.add(device['id']);
      }
      const more = page['more'] === undefined ? undefined : MORE.parse(page['more']);
      if (more !== undefined) {
        expect(more.total).toBe(DEVICE_COUNT);
        expect(more.ask).toContain('next_offset');
      }
      offset = more?.next_offset;
    }
    expect(seen.size).toBe(DEVICE_COUNT);
  });

  it('never sends more than a voice page even when the model asks for everything', () => {
    const page = voiceFind({ limit: 500 });
    expect(rows(page, 'devices')).toHaveLength(VOICE_PAGE);
    expect(size(page)).toBeLessThan(VOICE_BUDGET);
  });

  it('finds a device by name with its id and capability keys for control', () => {
    const wanted = at(devices, 10);
    const found = voiceFind({ search: wanted.name });
    const [device] = rows(found, 'devices');
    expect(device).toMatchObject({ id: wanted.id, name: wanted.name, room: 'Dining room' });
    expect(device?.['capabilities']).toContain('raw:brightness_level');
    expect(found['more']).toBeUndefined();
    expect(size(found)).toBeLessThan(VOICE_BUDGET);
  });

  it('lists automations in a bounded summary that says more are available', () => {
    const listed = voiceAutomations({});
    expect(size(listed)).toBeLessThan(VOICE_BUDGET);
    expect(rows(listed, 'automations')).toHaveLength(VOICE_PAGE);
    expect(listed['more']).toMatchObject({ total: AUTOMATION_COUNT, next_offset: VOICE_PAGE });
    expect(rows(listed, 'automations')[0]).not.toHaveProperty('definition');
  });

  it('lists the automations of one room with their names and on state', () => {
    const listed = voiceAutomations({ rooms: ['Kitchen'] });
    const automations = rows(listed, 'automations');
    expect(automations.length).toBeGreaterThan(0);
    for (const automation of automations) {
      expect(automation['rooms']).toContain('Kitchen');
      expect(typeof automation['name']).toBe('string');
      expect(typeof automation['on']).toBe('boolean');
    }
    expect(size(listed)).toBeLessThan(VOICE_BUDGET);
  });

  it('gives one automation in full when asked for it by id', () => {
    const [first] = opened.store.automations.list();
    const listed = voiceAutomations({ automationId: first?.id });
    const [automation] = rows(listed, 'automations');
    expect(automation).toMatchObject({ id: first?.id, definition: first?.definition });
    expect(size(listed)).toBeLessThan(VOICE_BUDGET);
  });

  it('keeps the full automation records for text chats', () => {
    const full = chatAutomations({});
    expect(rows(full, 'automations')).toHaveLength(AUTOMATION_COUNT);
    expect(rows(full, 'automations')[0]).toHaveProperty('definition');
  });

  it('never reaches the last-resort size guard on these calls', () => {
    voiceFind({});
    voiceAutomations({});
    expect(logs.events()).not.toContain('voice.result_over_guard');
  });

  it('declares the voice page as the limit of find_devices', () => {
    const spec = voiceSpecOf({
      name: 'find_devices',
      description: '',
      inputSchema: { type: 'object', properties: { limit: { type: 'integer', maximum: 500 } } },
    });
    expect(spec.inputSchema).toHaveProperty('properties', {
      limit: { type: 'integer', maximum: VOICE_PAGE, default: VOICE_PAGE },
    });
  });
});
