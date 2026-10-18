import { describe, expect, it, vi } from 'vitest';
import type { RouteDefinition, TabKey } from './route-types';

const TABS: readonly TabKey[] = [
  'home',
  'devices',
  'cameras',
  'fitness',
  'assistant',
  'talk',
  'automations',
  'settings',
];

vi.mock('./routes', () => ({
  TAB_ROUTES: TABS.map((tab): RouteDefinition => ({
    key: tab,
    href: '/',
    title: tab,
    icon: 'home',
    tab,
    parent: null,
    keywords: [],
    available: () => true,
    searchable: true,
  })),
}));

const { navModel } = await import('./nav-model');

const AVAILABILITY = {
  hasDevices: true,
  hasClimate: false,
  hasCameras: true,
  hasHealth: true,
  hasScenes: false,
  hasEnergy: false,
  hasSecurity: false,
  hasIr: false,
  hasWatch: false,
  needsAttention: false,
} as const;

describe('the phone bar model', () => {
  it('highlights a bar page and leaves the sheet handle plain', () => {
    const model = navModel('bar', 'devices', AVAILABILITY, 0);
    expect(model.pages.find((entry) => entry.active)?.route.tab).toBe('devices');
    expect(model.sheetActive).toBe(false);
  });

  it('highlights the assistant orb and leaves the sheet handle plain', () => {
    const model = navModel('bar', 'assistant', AVAILABILITY, 0);
    expect(model.orb?.active).toBe(true);
    expect(model.sheetActive).toBe(false);
  });

  it('highlights the sheet handle on a page that is not on the bar', () => {
    for (const tab of ['talk', 'automations', 'settings'] as const) {
      const model = navModel('bar', tab, AVAILABILITY, 0);
      expect(model.pages.some((entry) => entry.active)).toBe(false);
      expect(model.sheetActive).toBe(true);
    }
  });

  it('never highlights the sheet handle in the sidebar and rail models', () => {
    expect(navModel('sidebar', 'settings', AVAILABILITY, 0).sheetActive).toBe(false);
  });
});
