import { describe, expect, it } from 'vitest';
import { makeTable, type StoreState } from '../store/state';
import { uiRowFixture } from '../plugins/declared/ui-fixture';
import { pluginUiPages } from './plugin-ui-pages';
import type { SourceLinks } from './sources';

function linksOf(): SourceLinks {
  return { links: new Map(), icons: new Map(), parents: new Map(), plugins: new Set() };
}

function tableOf(rows: ReturnType<typeof uiRowFixture>[]): StoreState['tables']['plugin_ui'] {
  return makeTable(
    Object.fromEntries(rows.map((row) => [row.id, row])),
    rows.map((row) => row.id),
    1,
  );
}

describe('pluginUiPages', () => {
  it('adds the plugin, each of its pages and each section, nested one under the other', () => {
    const out = linksOf();
    const pages = pluginUiPages(tableOf([uiRowFixture()]), out);
    expect(pages.map((page) => [page.path, page.title, page.description])).toStrictEqual([
      ['plugin-ui:garden', 'Garden', 'Plugin pages'],
      ['plugin-ui:garden/overview', 'Garden overview', 'Garden'],
      ['plugin-ui:garden/overview#0', 'Soil now', 'Garden, Garden overview'],
      ['plugin-ui:garden/overview#1', 'Wet spots', 'Garden, Garden overview'],
    ]);
    expect(out.parents.get('page:plugin-ui:garden/overview')).toBe('page:plugin-ui:garden');
    expect(out.parents.get('page:plugin-ui:garden/overview#1')).toBe(
      'page:plugin-ui:garden/overview',
    );
  });

  it('opens the page of the plugin for the plugin, its page and its sections', () => {
    const out = linksOf();
    pluginUiPages(tableOf([uiRowFixture()]), out);
    const open = {
      pathname: '/plugins/[pluginId]/[page]',
      params: { pluginId: 'garden', page: 'overview' },
    };
    expect(out.links.get('page:plugin-ui:garden')).toStrictEqual(open);
    expect(out.links.get('page:plugin-ui:garden/overview')).toStrictEqual(open);
    expect(out.links.get('page:plugin-ui:garden/overview#0')).toStrictEqual(open);
  });

  it('takes keywords from the plugin, page and section titles', () => {
    const pages = pluginUiPages(tableOf([uiRowFixture()]), linksOf());
    expect(pages[2]?.keywords).toStrictEqual(['section', 'Garden', 'Garden overview', 'Soil now']);
  });

  it('adds nothing for a plugin without pages', () => {
    expect(pluginUiPages(tableOf([uiRowFixture({ pages: [] })]), linksOf())).toStrictEqual([]);
  });
});
