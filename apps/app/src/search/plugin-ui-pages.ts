import type { PluginPage, PluginUiRow, SearchSources } from '@smarteverything/domain';
import { href } from '../app-shell/hrefs';
import { extensionIcon } from '../plugins/declared/extension-icon';
import { rowsOf, type StoreState } from '../store/state';
import type { SourceLinks } from './sources';

type Pages = SearchSources['pages'];

function pageKey(path: string): string {
  return `page:${path}`;
}

function sectionPages(ui: PluginUiRow, page: PluginPage, parent: string, out: SourceLinks): Pages {
  return page.sections.map((section, index) => {
    const path = `${parent}#${String(index)}`;
    out.links.set(pageKey(path), href.pluginPage(ui.id, page.id));
    out.icons.set(pageKey(path), extensionIcon(page.icon));
    out.parents.set(pageKey(path), pageKey(parent));
    return {
      path,
      title: section.title,
      description: `${ui.name}, ${page.title}`,
      keywords: ['section', ui.name, page.title, section.title],
    };
  });
}

function pagePages(ui: PluginUiRow, group: string, out: SourceLinks): Pages {
  return ui.pages.flatMap((page) => {
    const path = `${group}/${page.id}`;
    out.links.set(pageKey(path), href.pluginPage(ui.id, page.id));
    out.icons.set(pageKey(path), extensionIcon(page.icon));
    out.parents.set(pageKey(path), pageKey(group));
    return [
      {
        path,
        title: page.title,
        description: ui.name,
        keywords: ['plugin', 'page', ui.name, page.title],
      },
      ...sectionPages(ui, page, path, out),
    ];
  });
}

export function pluginUiPages(table: StoreState['tables']['plugin_ui'], out: SourceLinks): Pages {
  return rowsOf(table).flatMap((ui) => {
    const [first] = ui.pages;
    if (first === undefined) return [];
    const group = `plugin-ui:${ui.id}`;
    out.links.set(pageKey(group), href.pluginPage(ui.id, first.id));
    out.icons.set(pageKey(group), 'puzzle');
    return [
      {
        path: group,
        title: ui.name,
        description: 'Plugin pages',
        keywords: ['plugin', 'pages', ui.name],
      },
      ...pagePages(ui, group, out),
    ];
  });
}
