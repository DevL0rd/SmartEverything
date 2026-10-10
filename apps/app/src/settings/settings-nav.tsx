import type { ReactNode } from 'react';
import { useDeferredValue, useState } from 'react';
import { View } from 'react-native';
import { useNavigation, usePathname, useRouter, type Href } from 'expo-router';
import { StackActions, useRoute } from 'expo-router/react-navigation';
import { href } from '../app-shell/hrefs';
import { useSizeClass } from '../design/size-class';
import { NavRow } from '../components/rows';
import { SearchField } from '../components/search-field';
import { List } from '../components/section';
import { Text } from '../components/text';
import { useStoreSelector } from '../store/store-context';
import { useSettingEnv } from './env';
import { pageAvailable, useBuiltSettingsPages } from './availability';
import { visibleSettings } from './registry';
import { SETTINGS_GROUPS, SETTINGS_TREE, pageHref, settingsTrail } from './tree';
import type { SettingEnv, SettingsPageDefinition } from './types';

function currentPage(pathname: string): string | null {
  if (pathname === '/settings') {
    return 'home';
  }
  const match = /^\/settings\/(.+)$/.exec(pathname);
  return match?.[1] ?? null;
}

function useOpenSection(): (target: Href) => void {
  const router = useRouter();
  const navigation = useNavigation();
  const route = useRoute();
  return (target) => {
    const nested = navigation.getState()?.routes.find((entry) => entry.key === route.key)?.state;
    if (nested?.key !== undefined && (nested.index ?? 0) > 0) {
      navigation.dispatch({ ...StackActions.popToTop(), target: nested.key });
    }
    router.push(target);
  };
}

function TopRow({
  page,
  selected,
  split,
}: {
  readonly page: SettingsPageDefinition;
  readonly selected: boolean;
  readonly split: boolean;
}): ReactNode {
  const open = useOpenSection();
  const summary = useStoreSelector((state) => page.summary?.(state) ?? null);
  const target = pageHref(page);
  return (
    <NavRow
      title={page.title}
      icon={page.icon}
      selected={selected}
      {...(split
        ? {
            onPress: (): void => {
              if (!selected) {
                open(target);
              }
            },
          }
        : { href: target })}
      {...(summary === null ? {} : { subtitle: summary })}
    />
  );
}

function Groups({
  env,
  current,
  split,
}: {
  readonly env: SettingEnv;
  readonly current: string | null;
  readonly split: boolean;
}): ReactNode {
  const built = useBuiltSettingsPages();
  return (
    <>
      {SETTINGS_GROUPS.map((group) => {
        const pages = SETTINGS_TREE.filter(
          (page) => page.group === group && pageAvailable(page, { env, built }),
        );
        if (pages.length === 0) {
          return null;
        }
        return (
          <List key={group} title={group} inset>
            {pages.map((page) => (
              <TopRow
                key={page.id}
                page={page}
                split={split}
                selected={
                  current !== null && (current === page.id || current.startsWith(`${page.id}/`))
                }
              />
            ))}
          </List>
        );
      })}
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
      pageAvailable(page, { env, built }) &&
      [page.title, ...page.keywords].some((word) => matches(word, needle)),
  );
  const settings = visibleSettings(env).filter((setting) =>
    [setting.title, ...setting.keywords].some((word) => matches(word, needle)),
  );
  if (pages.length + settings.length === 0) {
    return (
      <Text variant="body" tone="variant" className="px-4 py-6">
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

export function SettingsNav(): ReactNode {
  const env = useSettingEnv();
  const { split } = useSizeClass();
  const pathname = usePathname();
  const current = split ? currentPage(pathname) : null;
  const [query, setQuery] = useState('');
  const shown = useDeferredValue(query);
  return (
    <View className="gap-section-gap">
      <SearchField value={query} onChange={setQuery} placeholder="Search settings" />
      {shown.trim() === '' ? (
        <Groups env={env} current={current} split={split} />
      ) : (
        <Results env={env} query={shown} />
      )}
    </View>
  );
}
