import { describe, expect, it, vi } from 'vitest';
import { emptyState, makeTable } from '../store/state';
import { uiRowFixture } from '../plugins/declared/ui-fixture';

vi.mock('./routes', () => ({ TAB_ROUTES: [], ROUTES: [] }));
vi.mock('../settings/tree', () => ({ settingsPage: (): undefined => undefined }));
vi.mock('../settings/registry', () => ({ settingPageOf: (): undefined => undefined }));
vi.mock('../features/device-visuals', () => ({ deviceIcon: (): string => 'bulb' }));

const { navTargetHref, navTargetKey, targetFactsOf } = await import('./nav-targets');

const PAGE = { kind: 'page', path: 'plugin.garden.overview' } as const;

function stateWithGarden(): ReturnType<typeof emptyState> {
  const state = emptyState();
  const row = uiRowFixture();
  return {
    ...state,
    tables: { ...state.tables, plugin_ui: makeTable({ [row.id]: row }, [row.id], 1) },
  };
}

describe('a pin to a page that a plugin adds', () => {
  it('opens the dynamic page route of the plugin', () => {
    expect(navTargetHref(PAGE)).toStrictEqual({
      pathname: '/plugins/[pluginId]/[page]',
      params: { pluginId: 'garden', page: 'overview' },
    });
  });

  it('is keyed by the path the page opens at', () => {
    expect(navTargetKey(PAGE)).toBe('page:plugins/garden/overview');
  });

  it('exists with the page title and icon while the plugin is on', () => {
    expect(targetFactsOf(PAGE, stateWithGarden())).toStrictEqual({
      exists: true,
      title: 'Garden overview',
      icon: 'droplet',
      count: 0,
    });
  });

  it('no longer exists once the plugin is off or the page is gone', () => {
    expect(targetFactsOf(PAGE, emptyState()).exists).toBe(false);
    expect(
      targetFactsOf({ kind: 'page', path: 'plugin.garden.missing' }, stateWithGarden()).exists,
    ).toBe(false);
  });

  it('does not open anything for a route key that is not a page of the app or a plugin', () => {
    expect(navTargetHref({ kind: 'page', path: 'plugin.garden' })).toBeNull();
  });
});
