import type { ReactNode } from 'react';
import { useDeferredValue, useState } from 'react';
import { mainSettingsFirst } from '../app-shell/main-pages';
import { href } from '../app-shell/hrefs';
import type { AppHref } from '../components/app-href';
import type { ShellSearchConfig } from '../components/page-shell/search-slot';
import type { RailGroup } from '../components/page-shell/section-rail';
import type { ShellSections } from '../components/page-shell/shell-sections';
import type { IconName } from '../components/icon';
import { NavRow } from '../components/rows';
import { List } from '../components/section';
import { Text } from '../components/text';
import { useSettingEnv } from './env';
import { pageReachable, useBuiltSettingsPages } from './availability';
import { visibleSettings } from './registry';
import {
  SETTINGS_GROUPS,
  SETTINGS_TREE,
  breadcrumbOf,
  pageHref,
  settingsPage,
  settingsTrail,
} from './tree';
import type { SettingDefinition, SettingEnv, SettingsPageDefinition } from './types';

interface SettingsGroupPages {
  readonly title: string;
  readonly pages: readonly SettingsPageDefinition[];
}

function useGroupPages(): readonly SettingsGroupPages[] {
  const env = useSettingEnv();
  const built = useBuiltSettingsPages();
  return SETTINGS_GROUPS.map((group) => {
    const pages = SETTINGS_TREE.filter(
      (page) => page.group === group && pageReachable(page, { env, built }),
    );
    return { title: group, pages: group === 'App' ? mainSettingsFirst(pages) : pages };
  }).filter((group) => group.pages.length > 0);
}

function topPageOf(page: string, groups: readonly SettingsGroupPages[]): string {
  const top = breadcrumbOf(page)[0]?.id;
  if (top !== undefined) return top;
  const owner = groups
    .flatMap((group) => group.pages)
    .find((entry) => page === entry.id || page.startsWith(`${entry.id}/`));
  return owner?.id ?? page;
}

export function useSettingsSections(page: string): ShellSections {
  const groups = useGroupPages();
  const hrefs = new Map<string, AppHref>(
    groups.flatMap((group) => group.pages.map((entry) => [entry.id, pageHref(entry)] as const)),
  );
  const railGroups: readonly RailGroup[] = groups.map((group) => ({
    title: group.title,
    entries: group.pages.map((entry) => ({
      id: entry.id,
      label: entry.title,
      short: entry.short ?? entry.title.replace(/ settings$/, ''),
      icon: entry.icon,
      missing: null,
    })),
  }));
  return {
    groups: railGroups,
    active: topPageOf(page, groups),
    hrefOf: (id) => hrefs.get(id) ?? href.settings.page(id),
    navigation: 'replace',
    label: 'Settings',
  };
}

function matches(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle);
}

function trail(page: string): string {
  return settingsTrail(page)
    .map((entry) => entry.label)
    .join(' › ');
}

function resultIconOf(setting: SettingDefinition): IconName {
  if (setting.icon !== undefined) return setting.icon;
  const page = settingsPage(setting.page);
  if (page === undefined)
    throw new Error(`setting ${setting.id} names a missing page ${setting.page}`);
  return page.icon;
}

function Results({ env, query }: { readonly env: SettingEnv; readonly query: string }): ReactNode {
  const needle = query.trim().toLowerCase();
  const built = useBuiltSettingsPages();
  const pages = SETTINGS_TREE.filter(
    (page) =>
      pageReachable(page, { env, built }) &&
      [page.title, ...page.keywords].some((word) => matches(word, needle)),
  );
  const settings = visibleSettings(env).filter((setting) =>
    [setting.title, ...setting.keywords].some((word) => matches(word, needle)),
  );
  if (pages.length + settings.length === 0) {
    return (
      <Text variant="body" tone="variant" className="py-6" accessibilityLiveRegion="polite">
        {`Nothing in Settings matches “${query.trim()}”.`}
      </Text>
    );
  }
  return (
    <List inset>
      {[
        ...pages.map((page) => (
          <NavRow
            key={`page:${page.id}`}
            title={page.title}
            icon={page.icon}
            subtitle={trail(page.id)}
            href={pageHref(page)}
          />
        )),
        ...settings.map((setting) => (
          <NavRow
            key={setting.id}
            title={setting.title}
            icon={resultIconOf(setting)}
            subtitle={trail(setting.page)}
            href={href.settings.focus(setting.page, setting.id)}
          />
        )),
      ]}
    </List>
  );
}

export function useSettingsSearch(): ShellSearchConfig {
  const env = useSettingEnv();
  const [query, setQuery] = useState('');
  const shown = useDeferredValue(query);
  return {
    value: query,
    onChange: setQuery,
    placeholder: 'Search settings',
    label: 'Search settings',
    panel: query.trim() === '' ? null : <Results env={env} query={shown} />,
  };
}
