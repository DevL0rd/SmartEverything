import type { ReactNode } from 'react';
import type { Crumb } from '../components/breadcrumbs';
import type { MenuItem } from '../components/menu';
import { PageShell, type StandardShellProps } from '../components/page-shell/page-shell';
import type { ShellSearchConfig } from '../components/page-shell/search-slot';
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
  readonly contentWidth?: 'reading' | 'detail' | 'full';
  readonly primaryAction?: PrimaryActionProps;
  readonly scroll?: boolean;
  readonly children: ReactNode;
}

function crumbsOf(page: string, detail: boolean, trail: readonly Crumb[]): readonly Crumb[] {
  const crumbs = settingsTrail(page);
  return [...(detail ? crumbs : crumbs.slice(0, -1)), ...trail];
}

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
  const shown = search ?? (rail ? settingsSearch : undefined);
  return {
    ...(topLevel ? { back: false } : {}),
    ...(rail ? { sections } : {}),
    ...(shown === undefined ? {} : { search: shown }),
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
  contentWidth = 'reading',
  primaryAction,
  scroll = true,
  children,
  ...chrome
}: SettingsFrameProps): ReactNode {
  const railChrome = useRailChrome(page, detail, search);
  return (
    <PageShell
      title={title ?? settingsPage(page)?.title ?? 'Settings'}
      breadcrumbs={crumbsOf(page, detail, trail)}
      width={contentWidth}
      scroll={scroll}
      {...railChrome}
      {...pageChromeOf(chrome)}
      {...(primaryAction === undefined ? {} : { primaryAction })}
    >
      {children}
    </PageShell>
  );
}
