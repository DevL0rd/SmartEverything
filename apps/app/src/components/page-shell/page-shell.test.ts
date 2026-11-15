import { router } from 'expo-router';
import { describe, expect, it, vi } from 'vitest';
import type { KeyPress } from '../../design/keyboard';
import {
  escapeStepOf,
  searchOptionsPlaceOf,
  searchPanelShown,
  searchShortcutOf,
} from './search-slot';
import type { RailEntry } from './section-rail';
import { touchMenuOf, type ShellAction } from './shell-actions';
import { compactSections, tabRowsOf, type ShellLayout } from './shell-frame';
import { phoneTabsOf, sectionsPullUp, type ShellSections } from './shell-sections';

vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));

const KEY: KeyPress = { key: '/', command: false, alt: false, shift: false, typing: false };

function entry(id: string): RailEntry {
  return { id, label: id.toUpperCase(), icon: 'folder', missing: null, detail: null };
}

function sectionsOf(
  ids: readonly string[],
  active: string,
  phoneTabs?: readonly string[],
): ShellSections {
  return {
    groups: [{ title: null, entries: ids.map(entry) }],
    active,
    hrefOf: (id) => (id === 'b' ? '/drive/recent' : '/drive'),
    ...(phoneTabs === undefined ? {} : { phoneTabs }),
  };
}

describe('page search keys', () => {
  it('focuses the search on slash outside a field and on the find shortcut anywhere', () => {
    expect(searchShortcutOf(KEY)).toBe(true);
    expect(searchShortcutOf({ ...KEY, typing: true })).toBe(false);
    expect(searchShortcutOf({ ...KEY, key: 'f', command: true, typing: true })).toBe(true);
    expect(searchShortcutOf({ ...KEY, key: 'F', command: true })).toBe(true);
  });

  it('ignores other keys and modified variants', () => {
    expect(searchShortcutOf({ ...KEY, key: 'f' })).toBe(false);
    expect(searchShortcutOf({ ...KEY, alt: true })).toBe(false);
    expect(searchShortcutOf({ ...KEY, key: 'f', command: true, shift: true })).toBe(false);
  });

  it('clears a typed query on Escape and blurs an empty one', () => {
    expect(escapeStepOf('lamp')).toBe('clear');
    expect(escapeStepOf('')).toBe('blur');
  });

  it('shows the search panel only while a query is typed', () => {
    const search = { value: ' ', onChange: (): void => undefined, placeholder: 'Search' };
    expect(searchPanelShown(search)).toBe(false);
    expect(searchPanelShown({ ...search, panel: 'results' })).toBe(false);
    expect(searchPanelShown({ ...search, value: 'a', panel: 'results' })).toBe(true);
    expect(searchPanelShown({ ...search, value: 'a' })).toBe(false);
    expect(searchPanelShown(undefined)).toBe(false);
  });

  it('keeps search options inside the field only on a wide pointer screen', () => {
    expect(searchOptionsPlaceOf(true, false)).toBe('inside');
    expect(searchOptionsPlaceOf(true, true)).toBe('below');
    expect(searchOptionsPlaceOf(false, false)).toBe('below');
    expect(searchOptionsPlaceOf(false, true)).toBe('below');
  });
});

describe('phone sections', () => {
  it('shows up to five sections as tabs without a pull-up', () => {
    const sections = sectionsOf(['a', 'b', 'c', 'd', 'e'], 'b');
    expect(sectionsPullUp(sections)).toBe(false);
    expect(phoneTabsOf(sections)?.items.map((item) => item.key)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(phoneTabsOf(sections)?.items[1]?.href).toBe('/drive/recent');
  });

  it('keeps the pull-up for longer lists with the pinned sections and the active one as tabs', () => {
    const sections = sectionsOf(['a', 'b', 'c', 'd', 'e', 'f'], 'f', ['a', 'b']);
    expect(sectionsPullUp(sections)).toBe(true);
    expect(phoneTabsOf(sections)?.items.map((item) => item.key)).toEqual(['a', 'b', 'f']);
  });

  it('shows no tabs for a long list with nothing pinned on a pinned section', () => {
    expect(phoneTabsOf(sectionsOf(['a', 'b', 'c', 'd', 'e', 'f'], 'x'))).toBeNull();
  });
});

describe('touch header actions', () => {
  const action = (label: string): ShellAction => ({
    icon: 'plus',
    label,
    onPress: () => undefined,
  });
  const settings = { href: '/settings/drive', label: 'Drive settings' } as const;

  it('shows nothing extra when every action fits', () => {
    expect(touchMenuOf([action('A'), action('B')], [], undefined, false)).toEqual({ kind: 'none' });
  });

  it('shows the settings button alone when nothing else overflows', () => {
    expect(touchMenuOf([action('A')], [], settings, false)).toEqual({ kind: 'settings', settings });
  });

  it('moves the extra actions and settings into one menu', () => {
    const menu = touchMenuOf([action('A'), action('B'), action('C')], [], settings, false);
    expect(menu.kind === 'menu' ? menu.items.map((item) => item.label) : []).toEqual([
      'C',
      'Drive settings',
    ]);
  });

  it('opens the link of an overflowed action that only has a link', () => {
    const linked: ShellAction = { icon: 'plus', label: 'C', href: '/drive/recent' };
    const menu = touchMenuOf([action('A'), action('B'), linked], [], undefined, false);
    if (menu.kind === 'menu') menu.items[0]?.onPress();
    expect(router.push).toHaveBeenCalledWith('/drive/recent');
  });

  it('opens a menu when only pinned items arrive later', () => {
    expect(touchMenuOf([], [], undefined, true)).toEqual({ kind: 'menu', items: [] });
  });
});

describe('compact section navigation', () => {
  const layout = (rail: ShellLayout['rail']): ShellLayout => ({
    header: 'desktop',
    gutter: 32,
    rail,
    docked: false,
    column: { left: 32, width: 500 },
  });
  const tabs = { label: 'Views', active: 'grid', items: [{ key: 'grid', label: 'Grid' }] };
  const shell = { title: 'T', children: null, sections: sectionsOf(['a', 'b'], 'a'), tabs };

  it('uses the section tabs whenever no rail shows, whatever the header kind', () => {
    expect(compactSections(shell, null)).toBe(shell.sections);
    expect(compactSections(shell, 'icon')).toBeUndefined();
    expect(tabRowsOf(shell, layout(null)).map((row) => row.key)).toEqual(['sections', 'page']);
  });

  it('keeps only the page tabs beside a rail', () => {
    expect(tabRowsOf(shell, layout('wide')).map((row) => row.key)).toEqual(['page']);
  });
});
