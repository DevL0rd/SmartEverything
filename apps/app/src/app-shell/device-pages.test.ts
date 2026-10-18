import { describe, expect, it, vi } from 'vitest';
import { SHELLY_PRESENCE_PAGES } from '@smarteverything/domain';
import { APP_PLUGINS } from '../plugins/registry';
import type { Device } from '../store/state';
import { contributedDevicePages, pluginDevicePage, pluginDevicePages } from './device-pages';

function deviceOf(externalId: string, parentId: string | null, kind: Device['kind']): Device {
  return {
    id: externalId,
    provider: 'local',
    external_id: externalId,
    parent_id: parentId,
    kind,
    name: externalId,
    display_name: null,
    model: 'Test',
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
    label: externalId,
  };
}

vi.mock('../features/computers', () => import('../features/computers/model/pages'));

const SENSOR = deviceOf('shelly-presence:a', null, 'sensor');
const ZONE = deviceOf('shelly-presence:a:zone', 'shelly-presence:a', 'sensor');
const COMPUTER = deviceOf('computer-1', null, 'computer');
const LAMP = deviceOf('lamp-1', null, 'light');

describe('device pages', () => {
  it('lists every Shelly presence page for a physical sensor, in order', () => {
    expect(pluginDevicePages(SENSOR).map((page) => page.id)).toEqual(
      SHELLY_PRESENCE_PAGES.map((page) => page.id),
    );
  });

  it('offers no plugin pages to zones, computers or other devices', () => {
    for (const device of [ZONE, COMPUTER, LAMP]) {
      expect(pluginDevicePages(device)).toEqual([]);
    }
  });

  it('resolves a page by id only on a device it applies to', () => {
    expect(pluginDevicePage(SENSOR, 'presence-room')?.title).toBe('Room and zones');
    expect(pluginDevicePage(ZONE, 'presence-room')).toBeUndefined();
    expect(pluginDevicePage(SENSOR, 'nope')).toBeUndefined();
  });

  it('merges computer and plugin pages into one contribution list', () => {
    expect(contributedDevicePages(SENSOR)).toHaveLength(SHELLY_PRESENCE_PAGES.length);
    expect(contributedDevicePages(COMPUTER).map((page) => page.id)).toContain('codex');
    expect(contributedDevicePages(LAMP)).toEqual([]);
  });

  it('keeps plugin page ids unique across plugins', () => {
    const ids = APP_PLUGINS.flatMap((plugin) => plugin.devicePages?.pages ?? []).map(
      (page) => page.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('plugin settings search ids', () => {
  it('uses unique slug ids that are never the visible title', () => {
    for (const plugin of APP_PLUGINS) {
      const items = plugin.settingsSearch ?? [];
      const ids = items.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const item of items) {
        expect(item.id).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(item.id).not.toBe(item.title);
      }
    }
  });
});
