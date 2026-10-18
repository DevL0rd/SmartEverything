import { describe, expect, it } from 'vitest';
import { NETWORK_PAGES } from './pages-network';
import { STORAGE_PAGES } from './pages-storage';
import { SYSTEM_PAGES } from './pages-system';
import { computerPages } from './pages';
import { SECTIONS } from './sections';
import { SCOPE_ROWS } from '../scopes/scope-rows';
import type { Device } from '../../../store/state';

const MINE = [...NETWORK_PAGES, ...STORAGE_PAGES, ...SYSTEM_PAGES];

function computer(): Device {
  return {
    id: 'computer-1',
    provider: 'local',
    external_id: 'computer-1',
    parent_id: null,
    kind: 'computer',
    name: 'Workstation',
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
    label: 'Workstation',
  };
}

describe('network, storage and system pages', () => {
  it('register the three rail sections under the ids the rail links to', () => {
    expect(MINE.map((page) => page.id)).toEqual(['network', 'storage', 'system']);
    for (const page of MINE) {
      expect(SECTIONS.map((section) => section.id)).toContain(page.id);
      expect(computerPages(computer()).map((entry) => entry.id)).toContain(page.id);
    }
  });

  it('keep every searchable string on exactly one page', () => {
    const others = computerPages(computer()).filter((page) => !MINE.includes(page));
    const taken = new Set([
      ...others.flatMap((page) => page.settings),
      ...others.map((p) => p.title),
    ]);
    for (const page of MINE) {
      for (const setting of page.settings) expect(taken.has(setting), setting).toBe(false);
    }
  });

  it('list the system access scope on the scopes page', () => {
    expect(SCOPE_ROWS.map((row) => row.scope)).toContain('system');
  });
});
