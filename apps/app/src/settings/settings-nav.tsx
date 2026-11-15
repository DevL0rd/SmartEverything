import type { ReactNode } from 'react';
import { useDeferredValue, useState } from 'react';
import { mainSettingsFirst } from '../app-shell/main-pages';
import { href } from '../app-shell/hrefs';
import type { AppHref } from '../components/app-href';
import { shellRailOf } from '../components/page-shell/layout';
import type { ShellSearchConfig } from '../components/page-shell/search-slot';
import type { RailGroup } from '../components/page-shell/section-rail';
import type { ShellSections } from '../components/page-shell/shell-sections';
import { NavRow } from '../components/rows';
import { List } from '../components/section';
import { Text } from '../components/text';
import { useSizeClass } from '../design/size-class';
import { useStoreSelector } from '../store/store-context';
import { useSettingEnv } from './env';
import { pageReachable, useBuiltSettingsPages } from './availability';
import { visibleSettings } from './registry';
import { SETTINGS_GROUPS, SETTINGS_TREE, breadcrumbOf, pageHref, settingsTrail } from './tree';
import type { SettingEnv, SettingsPageDefinition } from './types';

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

export function useSettingsRail(): boolean {
  const size = useSizeClass();
  return size.header !== 'large' && shellRailOf(size.area, 'master') !== null;
}

function RailSummary({ page }: { readonly page: SettingsPageDefinition }): ReactNode {
  const summary = useStoreSelector((state) => page.summary?.(state) ?? null);
  if (summary === null) return null;
  return (
    <Text variant="caption" tone="variant" numberOfLines={1}>
      {summary}
    </Text>
  );
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
      short: entry.title.replace(/ settings$/, ''),
      icon: entry.icon,
      missing: null,
      detail: <RailSummary page={entry} />,
    })),
  }));
  return {
    groups: railGroups,
    active: topPageOf(page, groups),
    hrefOf: (id) => hrefs.get(id) ?? href.settings.page(id),
    navigation: 'replace',
    label: 'Settings',
    master: true,
  };
}

function TopRow({ page }: { readonly page: SettingsPageDefinition }): ReactNode {
  const summary = useStoreSelector((state) => page.summary?.(state) ?? null);
  return (
    <NavRow
      title={page.title}
      icon={page.icon}
      href={pageHref(page)}
      {...(summary === null ? {} : { subtitle: summary })}
    />
  );
}

export function SettingsNav(): ReactNode {
  const groups = useGroupPages();
  return (
    <>
      {groups.map((group) => (
        <List key={group.title} title={group.title} inset>
          {group.pages.map((page) => (
            <TopRow key={page.id} page={page} />
          ))}
        </List>
      ))}
    </>
  );
}

function matches(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle);
}

function trail(page: string): string {
  return settingsTrail(page)
    .map((entry) => entry.label)
    .join(' › ');
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
    panel: <Results env={env} query={shown} />,
  };
}
