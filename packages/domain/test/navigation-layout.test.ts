import { describe, expect, it } from 'vitest';
import {
  CLIENT_PREFS,
  DEFAULT_NAVIGATION_LAYOUT,
  NAVIGATION_LAYOUT,
  NAV_BAR_SLOTS,
  NAV_PIN_TARGET,
  NAV_SECTIONS,
  NAV_TARGET,
  navTargetOfSearch,
  resolveNavigation,
  type NavAvailability,
  type NavFolder,
  type NavPin,
  type NavSection,
  type NavigationLayout,
  type ResolvedNode,
} from '../src';

const DEVICE = '11111111-1111-4111-8111-111111111111';
const ROOM = '22222222-2222-4222-8222-222222222222';

const EVERYTHING: NavAvailability = { section: () => true, exists: () => true };

const without = (...gone: readonly NavSection[]): NavAvailability => ({
  section: (section) => !gone.includes(section),
  exists: () => true,
});

const pin = (id: string, title: string | null = null): NavPin => ({
  kind: 'pin',
  id,
  target: { kind: 'device', deviceId: DEVICE, focus: null },
  title,
  icon: null,
});

const folder = (id: string, items: NavFolder['items']): NavFolder => ({
  kind: 'folder',
  id,
  title: id,
  icon: 'folder',
  items,
});

const ALL_SECTIONS: NavFolder['items'] = NAV_SECTIONS.map((section) => ({
  kind: 'section',
  section,
}));

const keys = (nodes: readonly ResolvedNode[]): readonly string[] => nodes.map((node) => node.key);

const layoutOf = (
  items: NavigationLayout['items'],
  hidden: NavigationLayout['hidden'] = [],
): NavigationLayout => ({ items, hidden });

describe('the default navigation', () => {
  it('lists the sections in the page order', () => {
    const resolved = resolveNavigation(DEFAULT_NAVIGATION_LAYOUT, EVERYTHING);
    expect(keys(resolved.nodes)).toEqual([
      'section:home',
      'section:devices',
      'section:cameras',
      'section:fitness',
      'section:assistant',
      'section:talk',
      'section:automations',
    ]);
  });

  it('leaves out sections that are not available', () => {
    const resolved = resolveNavigation(DEFAULT_NAVIGATION_LAYOUT, without('cameras', 'talk'));
    expect(keys(resolved.nodes)).not.toContain('section:cameras');
    expect(keys(resolved.nodes)).not.toContain('section:talk');
  });

  it('puts the first four pages in the bar and keeps the assistant out of it', () => {
    const resolved = resolveNavigation(DEFAULT_NAVIGATION_LAYOUT, EVERYTHING);
    expect(keys(resolved.barSlots)).toEqual([
      'section:home',
      'section:devices',
      'section:cameras',
      'section:fitness',
    ]);
    expect(keys(resolved.overflow)).toEqual(['section:talk', 'section:automations']);
    expect(resolved.barSlots).toHaveLength(NAV_BAR_SLOTS);
  });
});

describe('a saved layout', () => {
  it('keeps the person order with pins and folders', () => {
    const resolved = resolveNavigation(
      layoutOf([
        pin('lamp'),
        { kind: 'section', section: 'fitness' },
        folder('rooms', [pin('sofa'), { kind: 'section', section: 'cameras' }]),
      ]),
      EVERYTHING,
    );
    expect(keys(resolved.nodes).slice(0, 3)).toEqual(['lamp', 'section:fitness', 'rooms']);
    const rooms = resolved.nodes[2];
    expect(rooms?.kind === 'folder' ? keys(rooms.items) : []).toEqual(['sofa', 'section:cameras']);
  });

  it('removes hidden sections and reports them for the show list', () => {
    const resolved = resolveNavigation(layoutOf(null, ['talk', 'fitness']), EVERYTHING);
    expect(keys(resolved.nodes)).not.toContain('section:talk');
    expect(keys(resolved.nodes)).not.toContain('section:fitness');
    expect(resolved.hidden).toEqual(['fitness', 'talk']);
  });

  it('does not list a hidden section that is not available as hidden', () => {
    const resolved = resolveNavigation(layoutOf(null, ['talk']), without('talk'));
    expect(resolved.hidden).toEqual([]);
  });

  it('appends an available section that no saved item mentions', () => {
    const resolved = resolveNavigation(
      layoutOf([{ kind: 'section', section: 'home' }, pin('lamp')]),
      EVERYTHING,
    );
    expect(keys(resolved.nodes)).toEqual([
      'section:home',
      'lamp',
      'section:devices',
      'section:cameras',
      'section:fitness',
      'section:assistant',
      'section:talk',
      'section:automations',
    ]);
  });

  it('does not append a section that a folder already holds', () => {
    const resolved = resolveNavigation(layoutOf([folder('all', ALL_SECTIONS)]), EVERYTHING);
    expect(keys(resolved.nodes)).toEqual(['all']);
  });

  it('keeps the first place of a section listed twice and reports it', () => {
    const stored: NavigationLayout = {
      items: [
        { kind: 'section', section: 'devices' },
        pin('lamp'),
        { kind: 'section', section: 'devices' },
      ],
      hidden: [],
    };
    const resolved = resolveNavigation(stored, EVERYTHING);
    expect(keys(resolved.nodes).filter((key) => key === 'section:devices')).toHaveLength(1);
    expect(keys(resolved.nodes).indexOf('section:devices')).toBe(0);
    expect(resolved.duplicates).toEqual(['devices']);
  });

  it('keeps a pin whose target is gone and marks it missing', () => {
    const resolved = resolveNavigation(layoutOf([pin('lamp')]), {
      section: () => true,
      exists: () => false,
    });
    expect(resolved.nodes[0]).toMatchObject({ kind: 'pin', key: 'lamp', missing: true });
  });

  it('marks a missing pin inside a folder too', () => {
    const resolved = resolveNavigation(layoutOf([folder('rooms', [pin('lamp')])]), {
      section: () => true,
      exists: () => false,
    });
    const rooms = resolved.nodes[0];
    expect(rooms?.kind === 'folder' ? rooms.items[0] : null).toMatchObject({ missing: true });
  });

  it('takes pins and folders into the four bar slots in order and the rest into the sheet', () => {
    const resolved = resolveNavigation(
      layoutOf([
        pin('a'),
        { kind: 'section', section: 'assistant' },
        folder('b', []),
        pin('c'),
        pin('d'),
        pin('e'),
      ]),
      EVERYTHING,
    );
    expect(keys(resolved.barSlots)).toEqual(['a', 'b', 'c', 'd']);
    expect(keys(resolved.overflow)[0]).toBe('e');
    expect(keys(resolved.nodes)).toContain('section:assistant');
  });

  it('leaves a section out of a folder when the section is not available', () => {
    const resolved = resolveNavigation(
      layoutOf([folder('mixed', [{ kind: 'section', section: 'cameras' }, pin('lamp')])]),
      without('cameras'),
    );
    const mixed = resolved.nodes[0];
    expect(mixed?.kind === 'folder' ? keys(mixed.items) : null).toEqual(['lamp']);
  });

  it('keeps an empty folder', () => {
    const resolved = resolveNavigation(layoutOf([folder('empty', [])]), EVERYTHING);
    expect(resolved.nodes[0]).toMatchObject({ kind: 'folder', items: [] });
  });
});

describe('the navigation schema', () => {
  it('accepts the default and a full layout', () => {
    expect(NAVIGATION_LAYOUT.safeParse(DEFAULT_NAVIGATION_LAYOUT).success).toBe(true);
    expect(
      NAVIGATION_LAYOUT.safeParse(layoutOf([pin('a', 'Lamp'), folder('b', [pin('c')])], ['talk']))
        .success,
    ).toBe(true);
  });

  it('refuses the same section twice, in one place or across a folder', () => {
    const twice = layoutOf([
      { kind: 'section', section: 'home' },
      folder('f', [{ kind: 'section', section: 'home' }]),
    ]);
    expect(NAVIGATION_LAYOUT.safeParse(twice).success).toBe(false);
  });

  it('refuses a repeated id', () => {
    expect(NAVIGATION_LAYOUT.safeParse(layoutOf([pin('a'), pin('a')])).success).toBe(false);
    expect(NAVIGATION_LAYOUT.safeParse(layoutOf([pin('a'), folder('a', [])])).success).toBe(false);
  });

  it('refuses hiding the assistant, a folder in a folder and an unknown icon', () => {
    expect(NAVIGATION_LAYOUT.safeParse({ items: null, hidden: ['assistant'] }).success).toBe(false);
    expect(
      NAVIGATION_LAYOUT.safeParse({
        items: [{ ...folder('f', []), items: [folder('g', [])] }],
        hidden: [],
      }).success,
    ).toBe(false);
    expect(
      NAVIGATION_LAYOUT.safeParse({ items: [{ ...pin('a'), icon: 'rocket' }], hidden: [] }).success,
    ).toBe(false);
  });

  it('lets the assistant open a settings page or a chat but never pins one', () => {
    const setting = { kind: 'setting', page: 'appearance/navigation', setting: null } as const;
    const chat = { kind: 'chat', chatId: ROOM } as const;
    expect(NAV_TARGET.safeParse(setting).success).toBe(true);
    expect(NAV_TARGET.safeParse(chat).success).toBe(true);
    for (const target of [setting, chat]) {
      expect(NAV_PIN_TARGET.safeParse(target).success).toBe(false);
      expect(
        NAVIGATION_LAYOUT.safeParse({ items: [{ ...pin('a'), target }], hidden: [] }).success,
      ).toBe(false);
    }
  });

  it('pins every kind of thing the person can pin', () => {
    const targets = [
      { kind: 'section', section: 'fitness' },
      { kind: 'page', path: 'fitness-sleep' },
      { kind: 'device', deviceId: DEVICE, focus: null },
      { kind: 'camera', deviceId: DEVICE },
      { kind: 'room', roomId: ROOM },
      { kind: 'group', groupId: ROOM },
      { kind: 'scene', sceneId: ROOM },
      { kind: 'automation', automationId: ROOM, focus: null },
    ] as const;
    for (const target of targets) expect(NAV_PIN_TARGET.safeParse(target).success).toBe(true);
    expect(NAV_PIN_TARGET.options.map((option) => option.shape.kind.value)).toEqual(
      targets.map((target) => target.kind),
    );
  });

  it('never lets a pin point at a navigation item', () => {
    expect(NAV_TARGET.safeParse({ kind: 'nav', node: 'lamp' }).success).toBe(true);
    expect(
      NAVIGATION_LAYOUT.safeParse({
        items: [{ ...pin('a'), target: { kind: 'nav', node: 'b' } }],
        hidden: [],
      }).success,
    ).toBe(false);
  });

  it('is a profile preference, and the device layout a client one', () => {
    expect(CLIENT_PREFS.navigation.scope).toBe('profile');
    expect(CLIENT_PREFS.navigation_device.scope).toBe('client');
    const stored = CLIENT_PREFS.navigation.encode(layoutOf([pin('a')]));
    expect(CLIENT_PREFS.navigation.decode(stored)).toMatchObject({ status: 'stored' });
    expect(CLIENT_PREFS.navigation_device.decode(null)).toEqual({
      status: 'absent',
      value: { override: null },
    });
  });
});

describe('pins made from search results and chat links', () => {
  it.each([
    [
      { kind: 'page', path: 'fitness-sleep' },
      { kind: 'page', path: 'fitness-sleep' },
    ],
    [
      { kind: 'device', deviceId: DEVICE },
      { kind: 'device', deviceId: DEVICE, focus: null },
    ],
    [
      { kind: 'device-page', deviceId: DEVICE, focus: 'brightness' },
      { kind: 'device', deviceId: DEVICE, focus: 'brightness' },
    ],
    [
      { kind: 'camera', deviceId: DEVICE, talk: true },
      { kind: 'camera', deviceId: DEVICE },
    ],
    [
      { kind: 'room', roomId: ROOM },
      { kind: 'room', roomId: ROOM },
    ],
    [
      { kind: 'scene', sceneId: ROOM },
      { kind: 'scene', sceneId: ROOM },
    ],
    [
      { kind: 'automation', automationId: ROOM, enabled: true },
      { kind: 'automation', automationId: ROOM, focus: null },
    ],
  ] as const)('maps the search target %j', (open, expected) => {
    expect(navTargetOfSearch(open)).toEqual(expected);
  });

  it('has no pin for a command or a setting value', () => {
    expect(
      navTargetOfSearch({ kind: 'command', deviceId: DEVICE, capability: 'power', value: true }),
    ).toBeNull();
    expect(navTargetOfSearch({ kind: 'setting', settingId: 'time_zone', value: null })).toBeNull();
  });
});
