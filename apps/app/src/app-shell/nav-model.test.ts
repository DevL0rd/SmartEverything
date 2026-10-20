import { describe, expect, it, vi } from 'vitest';
import {
  resolveNavigation,
  type NavFolder,
  type NavPin,
  type NavPinTarget,
  type NavigationLayout,
} from '@smarteverything/domain';
import type { TargetFacts } from './nav-targets';
import type { TabKey } from './route-types';

const { tabRoutes, allRoutes } = vi.hoisted(() => {
  const tabs = [
    'home',
    'devices',
    'cameras',
    'fitness',
    'assistant',
    'talk',
    'automations',
    'settings',
  ] as const;
  const available = (): boolean => true;
  const tabRoutes = tabs.map((tab) => ({
    key: tab,
    href: tab === 'home' ? '/' : `/${tab}`,
    title: tab,
    icon: 'home',
    tab,
    parent: null,
    keywords: [],
    available,
    searchable: true,
  }));
  const sleepRoute = {
    key: 'fitness-sleep',
    href: '/fitness/sleep',
    title: 'Sleep',
    icon: 'moon',
    tab: 'fitness',
    parent: 'fitness',
    keywords: [],
    available,
    searchable: true,
  };
  return { tabRoutes, allRoutes: [...tabRoutes, sleepRoute] };
});

vi.mock('./routes', () => ({ TAB_ROUTES: tabRoutes, ROUTES: allRoutes }));
vi.mock('../settings/tree', () => ({ settingsPage: (): undefined => undefined }));
vi.mock('../settings/registry', () => ({ settingPageOf: (): undefined => undefined }));
vi.mock('../features/device-visuals', () => ({ deviceIcon: (): string => 'bulb' }));

const { navModel, leafEntries, routeNameOfTab } = await import('./nav-model');
const { TAB_NAMES } = await import('./tab-names');
const { navTargetKey, leafKeyOfPath } = await import('./nav-targets');

const DEVICE = '11111111-1111-4111-8111-111111111111';
const ROOM = '22222222-2222-4222-8222-222222222222';

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

const DEFAULT: NavigationLayout = { items: null, hidden: [] };

const lamp: NavPinTarget = { kind: 'device', deviceId: DEVICE, focus: null };
const room: NavPinTarget = { kind: 'room', roomId: ROOM };
const sleep: NavPinTarget = { kind: 'page', path: 'fitness-sleep' };

const pin = (id: string, target: NavPinTarget, title: string | null = null): NavPin => ({
  kind: 'pin',
  id,
  target,
  title,
  icon: null,
});

const FACTS = new Map<string, TargetFacts>([
  [navTargetKey(lamp), { exists: true, title: 'Bedroom lamp', icon: 'bulb', count: 0 }],
  [navTargetKey(room), { exists: true, title: 'Kitchen', icon: 'grid', count: 0 }],
  [navTargetKey(sleep), { exists: true, title: 'Sleep', icon: 'moon', count: 0 }],
]);

interface Scene {
  readonly layout?: NavigationLayout;
  readonly current?: TabKey;
  readonly leaf?: string;
  readonly openFolders?: readonly string[];
  readonly unread?: number;
  readonly gone?: readonly string[];
}

function modelOf(scene: Scene = {}): ReturnType<typeof navModel> {
  const gone = new Set(scene.gone ?? []);
  const resolved = resolveNavigation(scene.layout ?? DEFAULT, {
    section: () => true,
    exists: (target) => !gone.has(navTargetKey(target)),
  });
  return navModel({
    resolved,
    facts: FACTS,
    availability: AVAILABILITY,
    unread: scene.unread ?? 0,
    current: scene.current ?? 'home',
    leaf: scene.leaf ?? '',
    openFolders: scene.openFolders ?? [],
  });
}

const titles = (nodes: readonly { readonly title: string }[]): readonly string[] =>
  nodes.map((node) => node.title);

describe('the default navigation', () => {
  it('puts the first four pages in the bar and the rest in the sheet', () => {
    const model = modelOf();
    expect(titles(model.bar)).toEqual(['home', 'devices', 'cameras', 'fitness']);
    expect(titles(model.overflow)).toEqual(['talk', 'automations']);
  });

  it('lists every page, the Assistant included, in the sidebar order', () => {
    expect(titles(modelOf().nodes)).toEqual([
      'home',
      'devices',
      'cameras',
      'fitness',
      'assistant',
      'talk',
      'automations',
    ]);
  });

  it('keeps Settings apart from the pages', () => {
    const model = modelOf({ current: 'settings' });
    expect(titles(model.system)).toEqual(['settings']);
    expect(model.system[0]?.active).toBe(true);
  });

  it('offers the Assistant as the orb with the unread count', () => {
    const model = modelOf({ unread: 3 });
    expect(model.orb?.title).toBe('assistant');
    expect(model.orb?.count).toBe(3);
  });
});

describe('the active item', () => {
  it('highlights a bar page and leaves the sheet handle plain', () => {
    const model = modelOf({ current: 'devices' });
    expect(model.bar.find((node) => node.active)?.title).toBe('devices');
    expect(model.sheetActive).toBe(false);
  });

  it('highlights the assistant orb and leaves the sheet handle plain', () => {
    const model = modelOf({ current: 'assistant' });
    expect(model.orb?.active).toBe(true);
    expect(model.sheetActive).toBe(false);
  });

  it('highlights the sheet handle on a page that is not in the bar', () => {
    for (const tab of ['talk', 'automations', 'settings'] as const) {
      const model = modelOf({ current: tab });
      expect(model.bar.some((node) => node.active)).toBe(false);
      expect(model.sheetActive).toBe(true);
    }
  });

  it('highlights a pin on its own page and not the section below it', () => {
    const layout: NavigationLayout = { items: [pin('lamp', lamp)], hidden: [] };
    const on = modelOf({ layout, current: 'home', leaf: navTargetKey(lamp) });
    expect(on.bar.find((node) => node.active)?.title).toBe('Bedroom lamp');
    expect(on.bar.filter((node) => node.active)).toHaveLength(1);
    const off = modelOf({ layout, current: 'home', leaf: navTargetKey(room) });
    expect(off.bar.find((node) => node.active)?.title).toBe('home');
  });

  it('matches a pinned sub-page from the path of the focused screen', () => {
    const layout: NavigationLayout = { items: [pin('sleep', sleep)], hidden: [] };
    const model = modelOf({ layout, current: 'fitness', leaf: leafKeyOfPath('/fitness/sleep') });
    expect(model.bar.find((node) => node.active)?.title).toBe('Sleep');
  });
});

describe('pins', () => {
  it('shows the live name and icon of what they point at', () => {
    const layout: NavigationLayout = { items: [pin('lamp', lamp)], hidden: [] };
    const entry = leafEntries(modelOf({ layout }).nodes).find((item) => item.key === 'lamp');
    expect(entry).toMatchObject({
      kind: 'pin',
      title: 'Bedroom lamp',
      icon: 'bulb',
      missing: false,
    });
  });

  it('keeps the name the person gave a pin', () => {
    const layout: NavigationLayout = { items: [pin('lamp', lamp, 'Reading light')], hidden: [] };
    expect(titles(modelOf({ layout }).nodes)).toEqual([
      'Reading light',
      'home',
      'devices',
      'cameras',
      'fitness',
      'assistant',
      'talk',
      'automations',
    ]);
  });

  it('flags a pin whose target is gone instead of dropping it', () => {
    const layout: NavigationLayout = { items: [pin('lamp', lamp)], hidden: [] };
    const entry = leafEntries(modelOf({ layout, gone: [navTargetKey(lamp)] }).nodes)[0];
    expect(entry).toMatchObject({ key: 'lamp', missing: true, active: false });
  });

  it('never marks a missing pin as the active page', () => {
    const layout: NavigationLayout = { items: [pin('lamp', lamp)], hidden: [] };
    const model = modelOf({ layout, gone: [navTargetKey(lamp)], leaf: navTargetKey(lamp) });
    expect(leafEntries(model.nodes).find((item) => item.key === 'lamp')?.active).toBe(false);
  });

  it('can start the bar with pins in the order the person chose', () => {
    const layout: NavigationLayout = {
      items: [pin('room', room), { kind: 'section', section: 'home' }, pin('lamp', lamp)],
      hidden: [],
    };
    expect(titles(modelOf({ layout }).bar)).toEqual(['Kitchen', 'home', 'Bedroom lamp', 'devices']);
  });
});

describe('folders', () => {
  const folder: NavFolder = {
    kind: 'folder',
    id: 'rooms',
    title: 'Rooms',
    icon: 'folder',
    items: [pin('room', room), pin('lamp', lamp)],
  };
  const layout: NavigationLayout = { items: [folder], hidden: [] };

  it('shows a folder as one node with its members', () => {
    const [first] = modelOf({ layout }).nodes;
    expect(first).toMatchObject({ kind: 'folder', title: 'Rooms', open: false });
    expect(first?.kind === 'folder' ? titles(first.items) : []).toEqual([
      'Kitchen',
      'Bedroom lamp',
    ]);
  });

  it('opens the folders the person left open', () => {
    const [first] = modelOf({ layout, openFolders: ['rooms'] }).nodes;
    expect(first?.kind === 'folder' ? first.open : null).toBe(true);
  });

  it('is active while one of its members is', () => {
    const [first] = modelOf({ layout, leaf: navTargetKey(room) }).nodes;
    expect(first?.active).toBe(true);
  });

  it('flattens to its members for the chrome that has no folder row yet', () => {
    expect(titles(leafEntries(modelOf({ layout }).nodes)).slice(0, 3)).toEqual([
      'Kitchen',
      'Bedroom lamp',
      'home',
    ]);
  });
});

describe('hidden pages', () => {
  it('leaves hidden sections out of the navigation and lists them apart', () => {
    const model = modelOf({ layout: { items: null, hidden: ['talk', 'automations'] } });
    expect(titles(model.nodes)).not.toContain('talk');
    expect(titles(model.hidden)).toEqual(['talk', 'automations']);
    expect(model.hidden.some((entry) => entry.active)).toBe(false);
  });
});

describe('the fixed tab navigator', () => {
  it('has a screen for every tab, whatever the layout hides or reorders', () => {
    const names: readonly string[] = TAB_NAMES;
    expect(tabRoutes.map((route) => routeNameOfTab(route.tab)).sort()).toEqual([...names].sort());
  });
});
