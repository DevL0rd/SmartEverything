import type { ReactNode } from 'react';
import type { Crumb } from '../components/breadcrumbs';
import type { MenuItem } from '../components/menu';
import { PageShell, type StandardShellProps } from '../components/page-shell/page-shell';
import { searchPanelShown, type ShellSearchConfig } from '../components/page-shell/search-slot';
import type { ShellAction } from '../components/page-shell/shell-actions';
import type { PrimaryActionProps } from '../components/primary-action';
import { useSettingsOrigin } from '../app-shell/settings-navigation';
import { useSettingsRail, useSettingsSearch, useSettingsSections } from './settings-nav';
import { settingsPage, settingsTrail } from './tree';

export interface SettingsFrameProps {
  readonly page: string;
  readonly title?: string;
  readonly detail?: boolean;
  readonly trail?: readonly Crumb[];
  readonly actions?: readonly ShellAction[];
  readonly overflow?: readonly MenuItem[];
  readonly search?: ShellSearchConfig;
  readonly banner?: ReactNode;
  readonly primaryAction?: PrimaryActionProps;
  readonly scroll?: boolean;
  readonly children: ReactNode;
}

function crumbsOf(page: string, detail: boolean, trail: readonly Crumb[]): readonly Crumb[] {
  const crumbs = settingsTrail(page);
  return [...(detail ? crumbs : crumbs.slice(0, -1)), ...trail];
}

const SEARCH_TITLE = 'Search results';

type ShellChrome = Partial<
  Pick<StandardShellProps, 'back' | 'sections' | 'search' | 'actions' | 'overflow' | 'banner'>
>;

function useRailChrome(
  page: string,
  detail: boolean,
  search: ShellSearchConfig | undefined,
): ShellChrome {
  const rail = useSettingsRail();
  const sections = useSettingsSections(page);
  const settingsSearch = useSettingsSearch();
  const origin = useSettingsOrigin();
  const topLevel = rail && !detail && settingsPage(page)?.parent === null && !origin;
  return {
    ...(topLevel ? { back: false } : {}),
    ...(rail ? { sections } : {}),
    search: search ?? settingsSearch,
  };
}

function pageChromeOf({
  actions,
  overflow,
  banner,
}: Pick<SettingsFrameProps, 'actions' | 'overflow' | 'banner'>): ShellChrome {
  return {
    ...(actions === undefined ? {} : { actions }),
    ...(overflow === undefined ? {} : { overflow }),
    ...(banner === undefined ? {} : { banner }),
  };
}

export function SettingsFrame({
  page,
  title,
  detail = false,
  trail = [],
  search,
  primaryAction,
  scroll = true,
  children,
  ...chrome
}: SettingsFrameProps): ReactNode {
  const railChrome = useRailChrome(page, detail, search);
  const searching = searchPanelShown(railChrome.search);
  return (
    <PageShell
      title={searching ? SEARCH_TITLE : (title ?? settingsPage(page)?.title ?? 'Settings')}
      breadcrumbs={searching ? settingsTrail(page).slice(0, 1) : crumbsOf(page, detail, trail)}
      scroll={scroll}
      {...railChrome}
      {...pageChromeOf(chrome)}
      {...(primaryAction === undefined ? {} : { primaryAction })}
    >
      {children}
    </PageShell>
  );
}
