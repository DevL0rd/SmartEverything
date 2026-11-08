import { describe, expect, it, vi } from 'vitest';
import type { Provider } from '@smarteverything/domain';
import { makeTable, type Device } from '../store/state';
import { deviceSources } from './device-entries';
import type { SourceLinks } from './sources';

vi.mock('../plugins/registry', () => ({ APP_PLUGINS: [] }));
vi.mock('../app-shell/device-pages', () => ({ contributedDevicePages: (): readonly [] => [] }));
vi.mock('../features/devices/detail/sections', () => ({
  sectionHref: (): string => '/',
  sectionsOf: (): readonly [] => [],
}));
vi.mock('../features/devices', async () => ({
  deviceModelOf: (await import('../features/devices/model/device-model')).deviceModelOf,
  isAppliance: (await import('../features/devices/appliance/appliance-model')).isAppliance,
  ADD_APPLIANCE_PAGE: (await import('../features/devices/appliance/add-appliance-model'))
    .ADD_APPLIANCE_PAGE,
}));

function deviceOf(model: string, provider: Provider): Device {
  return {
    id: model,
    provider,
    external_id: model,
    parent_id: null,
    kind: 'sensor',
    name: model,
    display_name: null,
    model,
    manufacturer: 'Test',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: [],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    label: model,
  };
}

function bluetoothTitles(device: Device): readonly string[] {
  const out: SourceLinks = {
    links: new Map(),
    icons: new Map(),
    parents: new Map(),
    plugins: new Set(),
  };
  const named = [{ device, name: device.name, room: null }];
  return deviceSources(named, out, makeTable({}, [], 0))
    .entries.filter((entry) => entry.id.includes(':bluetooth'))
    .map((entry) => entry.title);
}

describe('bluetooth observation search', () => {
  it('offers one Bluetooth updates entry for the Xiaomi door sensor', () => {
    expect(bluetoothTitles(deviceOf('isa.magnet.dw2hl', 'xiaomi'))).toEqual(['Bluetooth updates']);
  });

  it('offers nothing for other devices', () => {
    expect(bluetoothTitles(deviceOf('zhimi.airp.vb4', 'xiaomi'))).toEqual([]);
    expect(bluetoothTitles(deviceOf('isa.magnet.dw2hl', 'tuya'))).toEqual([]);
  });
});

function remoteActions(device: Device): readonly { title: string; parent: string | undefined }[] {
  const out: SourceLinks = {
    links: new Map(),
    icons: new Map(),
    parents: new Map(),
    plugins: new Set(),
  };
  const named = [{ device, name: device.name, room: null }];
  return deviceSources(named, out, makeTable({}, [], 0))
    .entries.filter((entry) => entry.id.startsWith('remote-action:'))
    .map((entry) => ({ title: entry.title, parent: out.parents.get(entry.id) }));
}

describe('IR remote search', () => {
  it('finds the in-page actions of a blaster under its Remote page', () => {
    const blaster = { ...deviceOf('ir-1', 'tuya'), kind: 'ir_blaster' as const };
    expect(remoteActions(blaster)).toEqual([
      { title: 'Make a scene', parent: 'devpage:ir-1:remote' },
      { title: 'Check with a plug', parent: 'devpage:ir-1:remote' },
      { title: 'It didn’t work?', parent: 'devpage:ir-1:remote' },
      { title: 'Learn a button', parent: 'devpage:ir-1:remote' },
      { title: 'Make it a device', parent: 'devpage:ir-1:remote' },
      { title: 'Add an appliance', parent: 'devpage:ir-1:remote' },
    ]);
  });

  it('finds only what an IR remote device page offers', () => {
    const remote = { ...deviceOf('ac-1', 'tuya'), kind: 'ir_remote' as const };
    expect(remoteActions(remote).map((action) => action.title)).toEqual([
      'Check with a plug',
      'It didn’t work?',
    ]);
  });

  it('finds learning and the blaster choice of an IR appliance under its Buttons page', () => {
    const appliance: Device = {
      ...deviceOf('ac-2', 'local'),
      kind: 'air_conditioner',
      details: { irApplianceId: 'remote-1', blasterId: 'ir-1', category: 'air conditioner' },
    };
    expect(remoteActions(appliance)).toEqual([
      { title: 'Learn buttons', parent: 'devpage:ac-2:buttons' },
      { title: 'Use another blaster', parent: 'devpage:ac-2:buttons' },
    ]);
  });

  it('offers nothing on other devices', () => {
    expect(remoteActions(deviceOf('plug-1', 'tuya'))).toEqual([]);
  });
});

describe('model and look search', () => {
  it('offers the Model and look page under the device settings with its synonyms', () => {
    const out: SourceLinks = {
      links: new Map(),
      icons: new Map(),
      parents: new Map(),
      plugins: new Set(),
    };
    const device = deviceOf('wiz.bulb', 'tuya');
    const named = [{ device, name: device.name, room: null }];
    const entry = deviceSources(named, out, makeTable({}, [], 0)).entries.find(
      (found) => found.title === 'Model and look',
    );
    expect(entry?.keywords).toEqual(expect.arrayContaining(['3D model', 'appearance', 'upload']));
    expect(out.parents.get(entry?.id ?? '')).toBe('devpage:wiz.bulb:settings');
  });
});
