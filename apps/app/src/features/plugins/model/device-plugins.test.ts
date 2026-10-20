import { describe, expect, it } from 'vitest';
import type { Device } from '../../../store/state';
import { href } from '../../../app-shell/hrefs';
import type { SettingDefinition } from '../../../settings/types';
import { devicePluginRows } from './device-plugins';

type Flow = Parameters<typeof href.connect>[0];

function link(id: string, flow: Flow, title: string): SettingDefinition {
  return {
    id: `devices.add.${id}`,
    page: 'devices/add',
    title,
    description: `${title} text`,
    icon: 'scale',
    keywords: [],
    scope: 'server',
    control: 'link',
    href: href.connect(flow),
  };
}

function device(id: string, model: string): Device {
  return {
    id,
    provider: 'local',
    external_id: id,
    parent_id: null,
    kind: 'other',
    name: id,
    display_name: null,
    model,
    manufacturer: 'test',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: [],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
    label: id,
  };
}

const DEFINITIONS = [
  link('treadmill', 'treadmill', 'Treadmill'),
  link('sonicare', 'sonicare', 'Toothbrush'),
  link('larq', 'larq', 'Water bottle'),
  link('bluetooth-scale', 'scale', 'Scale'),
  link('watch', 'watch', 'Watch'),
];

describe('device plugin rows', () => {
  it('lists every device plugin with the shared text and a setup link when none exists', () => {
    const rows = devicePluginRows([], DEFINITIONS);
    expect(rows.map((row) => row.title)).toEqual([
      'Treadmill',
      'Toothbrush',
      'Water bottle',
      'Scale',
      'Watch',
    ]);
    expect(rows[0]).toMatchObject({
      description: 'Treadmill text',
      status: null,
      count: 0,
      href: href.connect('treadmill'),
    });
  });

  it('shows a linked chip and the device settings when one device exists', () => {
    const rows = devicePluginRows([device('t1', 'kingsmith.treadmill.r1')], DEFINITIONS);
    expect(rows[0]).toMatchObject({
      status: 'Linked',
      count: 1,
      href: { pathname: '/device/[deviceId]/settings', params: { deviceId: 't1' } },
    });
  });

  it('shows the count and the devices settings page when several exist', () => {
    const rows = devicePluginRows(
      [device('a', 'x.toothbrush.a'), device('b', 'x.toothbrush.b')],
      DEFINITIONS,
    );
    expect(rows[1]).toMatchObject({ status: '2 linked', count: 2 });
  });

  it('adds a plugin by adding one entry', () => {
    const rows = devicePluginRows(
      [],
      [link('oralb', 'sonicare', 'Oral-B')],
      [{ id: 'oralb', addSetting: 'devices.add.oralb', families: ['toothbrush'] }],
    );
    expect(rows.map((row) => row.id)).toEqual(['oralb']);
  });

  it('skips an entry whose setup definition is missing', () => {
    expect(devicePluginRows([], [])).toEqual([]);
  });
});
