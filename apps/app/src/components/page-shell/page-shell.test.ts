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
import { pageMenuOf } from '../page-menu';
import { touchMenuItemsOf, type ShellAction } from './shell-actions';
import { barOptionsOf, searchInlineAt } from './bar-search';
import { bodyOf } from './shell-frame';
import { railFormOf, type ShellSections } from './shell-sections';

vi.mock('expo-router', () => ({ router: { push: vi.fn(), navigate: vi.fn() } }));

const KEY: KeyPress = { key: '/', command: false, alt: false, shift: false, typing: false };

function entry(id: string): RailEntry {
  return { id, label: id.toUpperCase(), icon: 'folder', missing: null };
}

function sectionsOf(ids: readonly string[], active: string): ShellSections {
  return {
    groups: [{ title: null, entries: ids.map(entry) }],
    active,
    hrefOf: (id) => (id === 'b' ? '/drive/recent' : '/drive'),
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

  it('shows the search panel only while the page hands one over', () => {
    const search = { value: '', onChange: (): void => undefined, placeholder: 'Search' };
    expect(searchPanelShown(search)).toBe(false);
    expect(searchPanelShown({ ...search, panel: 'results' })).toBe(true);
    expect(searchPanelShown({ ...search, value: 'a', panel: null })).toBe(false);
    expect(searchPanelShown({ ...search, value: 'a' })).toBe(false);
    expect(searchPanelShown(undefined)).toBe(false);
  });

  it('shows the page content for an empty search and the panel once the page hands one over', () => {
    const search = { value: '', onChange: (): void => undefined, placeholder: 'Search' };
    const base = { title: 'Page', children: 'content' };
    expect(bodyOf({ ...base, search: { ...search, panel: null } })).toBe('content');
    expect(bodyOf({ ...base, search })).toBe('content');
    expect(bodyOf({ ...base, search: { ...search, panel: 'results' } })).toBe('results');
  });

  it('keeps search options inside the field only on a wide pointer screen', () => {
    expect(searchOptionsPlaceOf(true, false)).toBe('inside');
    expect(searchOptionsPlaceOf(true, true)).toBe('below');
    expect(searchOptionsPlaceOf(false, false)).toBe('below');
    expect(searchOptionsPlaceOf(false, true)).toBe('below');
  });
});

describe('section rail form', () => {
  it('draws the full rail for sections, an icon rail on request and none without sections', () => {
    expect(railFormOf(sectionsOf(['a', 'b'], 'a'))).toBe('sections');
    expect(railFormOf({ ...sectionsOf(['a'], 'a'), iconRail: true })).toBe('icon');
    expect(railFormOf(undefined)).toBeNull();
  });
});

describe('touch header actions', () => {
  const action = (label: string): ShellAction => ({
    icon: 'plus',
    label,
    onPress: () => undefined,
  });
  const settings = { href: '/settings/drive', label: 'Drive settings' } as const;
  const labels = (items: readonly { readonly label: string }[] | undefined): readonly string[] =>
    (items ?? []).map((item) => item.label);

  it('shows no menu when every action fits and there is no settings page', () => {
    expect(pageMenuOf(touchMenuItemsOf([action('A'), action('B')], []), undefined, null)).toBe(
      null,
    );
  });

  it('opens one menu with the settings entry when nothing else overflows', () => {
    expect(labels(pageMenuOf(touchMenuItemsOf([action('A')], []), settings, null)?.items)).toEqual([
      'Drive settings',
    ]);
  });

  it('puts the extra actions, the page options and then settings into one menu', () => {
    const items = touchMenuItemsOf(
      [action('A'), action('B'), action('C')],
      [{ label: 'Show hidden items', onPress: (): void => undefined }],
    );
    expect(labels(pageMenuOf(items, settings, null)?.items)).toEqual([
      'C',
      'Show hidden items',
      'Drive settings',
    ]);
  });

  it('keeps the settings entry last after the pinned items that arrive later', () => {
    const pin = { label: 'Pin to the sidebar', onPress: (): void => undefined };
    const menu = pageMenuOf([], settings, () => [pin]);
    expect(labels(menu?.items)).toEqual([]);
    expect(labels(menu?.late?.())).toEqual(['Pin to the sidebar', 'Drive settings']);
  });

  it('opens the link of an overflowed action that only has a link', () => {
    const linked: ShellAction = { icon: 'plus', label: 'C', href: '/drive/recent' };
    touchMenuItemsOf([action('A'), action('B'), linked], [])[0]?.onPress();
    expect(router.push).toHaveBeenCalledWith('/drive/recent');
  });

  it('opens a menu when only pinned items arrive later', () => {
    expect(pageMenuOf([], undefined, () => [])?.items).toEqual([]);
  });
});

describe('top bar search', () => {
  it('keeps the field in the bar only when the title still has room, and an icon otherwise', () => {
    expect(searchInlineAt(332, 96)).toBe(false);
    expect(searchInlineAt(700, 140)).toBe(true);
    expect(searchInlineAt(611, 140)).toBe(false);
  });

  it('moves search options under the bar only where they do not sit inside the field', () => {
    const search = {
      value: '',
      onChange: (): void => undefined,
      placeholder: 'Find',
      options: 'O',
    };
    expect(barOptionsOf(search, 'below')).toBe('O');
    expect(barOptionsOf(search, 'inside')).toBeUndefined();
    expect(barOptionsOf(undefined, 'below')).toBeUndefined();
  });
});
