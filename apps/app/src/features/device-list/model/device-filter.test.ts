import { describe, expect, it } from 'vitest';
import type { DeviceKind, TableRow } from '@smarteverything/domain';
import { deviceOf, type Device } from '../../../store/state';
import { ANY, groupedDevices, isFiltering, kindOptions, type DeviceQuery } from './device-filter';

const LIVING = 'room-living';
const STUDY = 'room-study';
const LONG_NAME = 'Upstairs guest bedroom with en-suite and walk-in wardrobe';

const ROOMS: readonly TableRow<'rooms'>[] = [
  { id: LIVING, name: 'Living room', position: 0 },
  { id: STUDY, name: LONG_NAME, position: 1 },
];

const SHOW_ALL: DeviceQuery = { text: '', room: ANY, kind: ANY, offline: false };

interface Spec {
  readonly id: string;
  readonly kind: DeviceKind;
  readonly room: string | null;
  readonly online?: boolean;
  readonly hidden?: boolean;
}

function device({ id, kind, room, online = true, hidden = false }: Spec): Device {
  return deviceOf({
    id,
    provider: 'xiaomi',
    external_id: id,
    parent_id: null,
    kind,
    name: id,
    display_name: null,
    model: 'test.model',
    manufacturer: 'Test',
    provider_room: null,
    room_id: room,
    online,
    capabilities: [],
    details: {},
    hidden,
    favourite: false,
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
}

const DEVICES: readonly Device[] = [
  device({ id: 'ceiling', kind: 'light', room: LIVING }),
  device({ id: 'lamp', kind: 'light', room: LIVING }),
  device({ id: 'strip', kind: 'light', room: LIVING, online: false }),
  device({ id: 'tv', kind: 'television', room: LIVING }),
  device({ id: 'desk', kind: 'light', room: STUDY }),
  device({ id: 'fan', kind: 'fan', room: STUDY }),
  device({ id: 'loose', kind: 'light', room: null }),
  device({ id: 'spare', kind: 'light', room: null }),
];

function idsOf(devices: readonly Device[]): readonly string[] {
  return devices.map((entry) => entry.id).sort();
}

function sectionOf(query: DeviceQuery, key: string): ReturnType<typeof groupedDevices>[number] {
  const found = groupedDevices(DEVICES, ROOMS, query).find((section) => section.key === key);
  if (found === undefined) {
    throw new Error(`no section ${key}`);
  }
  return found;
}

describe('devices grouped into room sections', () => {
  it('puts two or more lights of a room in one lights card and keeps them out of the tiles', () => {
    const living = sectionOf(SHOW_ALL, LIVING);
    expect(idsOf(living.lights?.devices ?? [])).toEqual(['ceiling', 'lamp', 'strip']);
    expect(idsOf(living.devices)).toEqual(['tv']);
    expect(living.count).toBe(4);
    expect(living.lights?.target).toEqual({ kind: 'room', roomId: LIVING, families: ['light'] });
  });

  it('keeps a room with a single light as a normal tile', () => {
    const study = sectionOf(SHOW_ALL, STUDY);
    expect(study.lights).toBeNull();
    expect(idsOf(study.devices)).toEqual(['desk', 'fan']);
  });

  it('targets the unplaced lights by id because they share no room', () => {
    const unplaced = sectionOf(SHOW_ALL, 'none');
    expect(unplaced.lights?.target).toEqual({
      kind: 'devices',
      deviceIds: unplaced.lights?.devices.map((entry) => entry.id),
    });
  });

  it('leaves hidden lights out of the card and counts only visible lights toward it', () => {
    const hiddenPair = [
      device({ id: 'a', kind: 'light', room: LIVING }),
      device({ id: 'b', kind: 'light', room: LIVING, hidden: true }),
    ];
    const [section] = groupedDevices(hiddenPair, ROOMS, SHOW_ALL);
    expect(section?.lights).toBeNull();
    expect(idsOf(section?.devices ?? [])).toEqual(['a', 'b']);
  });

  it('shows matching lights as individual tiles while a text filter is active', () => {
    const living = sectionOf({ ...SHOW_ALL, text: 'lamp' }, LIVING);
    expect(living.lights).toBeNull();
    expect(idsOf(living.devices)).toEqual(['lamp']);
  });

  it('shows lights as individual tiles while a kind filter is active', () => {
    const living = sectionOf({ ...SHOW_ALL, kind: 'Light' }, LIVING);
    expect(living.lights).toBeNull();
    expect(idsOf(living.devices)).toEqual(['ceiling', 'lamp', 'strip']);
  });

  it('keeps the lights card when only a room is chosen', () => {
    const sections = groupedDevices(DEVICES, ROOMS, { ...SHOW_ALL, room: LIVING });
    expect(sections.map((section) => section.key)).toEqual([LIVING]);
    expect(sections[0]?.lights?.devices).toHaveLength(3);
  });

  it('keeps only offline devices when the offline toggle is on, as individual tiles', () => {
    const sections = groupedDevices(DEVICES, ROOMS, { ...SHOW_ALL, offline: true });
    expect(sections.map((section) => section.key)).toEqual([LIVING]);
    expect(sections[0]?.lights).toBeNull();
    expect(idsOf(sections[0]?.devices ?? [])).toEqual(['strip']);
  });

  it('keeps long room names whole in the section title', () => {
    expect(sectionOf(SHOW_ALL, STUDY).title).toBe(LONG_NAME);
  });

  it('returns the same lights objects on every call so row comparison can use identity', () => {
    const first = sectionOf(SHOW_ALL, LIVING).lights?.devices ?? [];
    const second = sectionOf(SHOW_ALL, LIVING).lights?.devices ?? [];
    expect(first.every((entry, index) => entry === second[index])).toBe(true);
  });
});

describe('what counts as filtering', () => {
  it('is false for a bare room choice and true for text, kind or offline', () => {
    expect(isFiltering({ ...SHOW_ALL, room: LIVING })).toBe(false);
    expect(isFiltering({ ...SHOW_ALL, text: ' x ' })).toBe(true);
    expect(isFiltering({ ...SHOW_ALL, text: '   ' })).toBe(false);
    expect(isFiltering({ ...SHOW_ALL, kind: 'Fan' })).toBe(true);
    expect(isFiltering({ ...SHOW_ALL, offline: true })).toBe(true);
  });
});

describe('kind options', () => {
  it('lists the kinds present and no longer carries an offline entry', () => {
    expect(kindOptions(DEVICES).map((option) => option.label)).toEqual([
      'All kinds',
      'Fans',
      'Lights',
      'TVs',
    ]);
  });
});
