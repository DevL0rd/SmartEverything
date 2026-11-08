import type { AppHref } from '../../components/app-href';
import type { SearchPage, SearchSources } from '@smarteverything/domain';
import type { IconName } from '../../components/icon';
import type { SourceLinks } from '../../search/sources';

export const EDITOR_PATH = '/home-map/edit';

export const SCAN_HELP_ROUTE: AppHref = '/home-map/scan-help';

export const STAGE = 'home-map';

export const HOME_MAP_WORDS: readonly string[] = [
  'home map',
  'map',
  'floor plan',
  'layout',
  'house map',
  'blueprint',
  'furniture',
  'decorate',
];

export interface MapPage extends SearchPage {
  readonly to: AppHref;
  readonly parent: string;
  readonly icon: IconName;
}

export type Query = Readonly<Record<string, string>>;

export function homeMapEditorHref(query: Query = {}): AppHref {
  return Object.keys(query).length === 0 ? EDITOR_PATH : { pathname: EDITOR_PATH, params: query };
}

export function pagePath(path: string): string {
  return `page:${path}`;
}

export function register(pages: readonly MapPage[], out: SourceLinks): SearchSources['pages'] {
  return pages.map(({ to, parent, icon, ...page }) => {
    out.links.set(pagePath(page.path), to);
    out.icons.set(pagePath(page.path), icon);
    out.parents.set(pagePath(page.path), parent);
    return page;
  });
}
