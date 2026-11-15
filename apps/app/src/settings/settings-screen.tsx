import type { ReactNode } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { CUSTOM_SETTINGS_SCREENS, customSettingsScreenId } from './custom-screens';
import { EmptyState } from '../components/empty-state';
import { PageShell } from '../components/page-shell/page-shell';
import type { PrimaryActionProps } from '../components/primary-action';
import { useSettingEnv } from './env';
import { SettingsNav, useSettingsRail, useSettingsSearch } from './settings-nav';
import { pageReachable, useBuiltSettingsPages } from './availability';
import { SettingsFrame } from './settings-frame';
import { href } from '../app-shell/hrefs';
import { legacyHref } from '../app-shell/legacy-routes';
import { retiredPageTarget } from './retired-pages';
import { SettingsPageBody, type SettingsBlocksLayout } from './settings-page';
import { onPlatform, settingsPage } from './tree';
import type { SettingsPageDefinition } from './types';

function SettingsList(): ReactNode {
  const search = useSettingsSearch();
  return (
    <PageShell title="Settings" search={search}>
      <SettingsNav />
    </PageShell>
  );
}

export function SettingsIndex(): ReactNode {
  return useSettingsRail() ? <SettingsPageScreen page="home" /> : <SettingsList />;
}

const PLATFORM_NAMES = {
  android: 'the phone',
  desktop: 'the desktop app',
  web: 'the web app',
} as const;

function ElsewhereOnly({ page }: { readonly page: SettingsPageDefinition }): ReactNode {
  const where = page.platform === undefined ? 'another device' : PLATFORM_NAMES[page.platform];
  return (
    <SettingsFrame page={page.id}>
      <EmptyState
        icon={page.platform === 'android' ? 'smartphone' : page.icon}
        title={`Only on ${where}`}
        body={`Open SmartEverything on ${where} to change these.`}
      />
    </SettingsFrame>
  );
}

function NotThere(): ReactNode {
  return (
    <PageShell title="Settings">
      <EmptyState
        icon="settings"
        title="Page not found"
        body="This settings page does not exist."
      />
    </PageShell>
  );
}

export function SettingsPageScreen({
  page,
  primaryAction,
  BlocksLayout,
}: {
  readonly page: string;
  readonly primaryAction?: PrimaryActionProps;
  readonly BlocksLayout?: SettingsBlocksLayout;
}): ReactNode {
  const env = useSettingEnv();
  const built = useBuiltSettingsPages();
  const definition = settingsPage(page);
  if (definition !== undefined && !onPlatform(definition, env)) {
    return <ElsewhereOnly page={definition} />;
  }
  if (definition === undefined || !pageReachable(definition, { env, built })) {
    return <NotThere />;
  }
  return (
    <SettingsFrame page={page} {...(primaryAction === undefined ? {} : { primaryAction })}>
      <SettingsPageBody
        key={page}
        page={page}
        {...(BlocksLayout === undefined ? {} : { BlocksLayout })}
      />
    </SettingsFrame>
  );
}

export function SettingsCatchAll(): ReactNode {
  const { page } = useLocalSearchParams<{ page: string[]; focus?: string }>();
  const id = page.join('/');
  const retired = retiredPageTarget(id);
  const moved = retired === null ? legacyHref(['settings', ...page]) : href.settings.page(retired);
  const Custom = CUSTOM_SETTINGS_SCREENS[customSettingsScreenId(id)];
  if (moved !== null) return <Redirect href={moved} />;
  return Custom === undefined ? <SettingsPageScreen page={id} /> : <Custom />;
}
