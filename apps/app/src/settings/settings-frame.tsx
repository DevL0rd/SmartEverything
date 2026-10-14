import type { ReactNode } from 'react';
import type { Crumb } from '../components/breadcrumbs';
import { PageHeader, type HeaderAction } from '../components/page-header';
import type { MenuItem } from '../components/menu';
import type { PrimaryActionProps } from '../components/primary-action';
import { Screen, type ScreenProps } from '../components/screen';
import { useSettingsOrigin } from '../app-shell/settings-navigation';
import { useSizeClass } from '../design/size-class';
import { useSettingsParentBack } from './settings-back';
import { settingsPage, settingsTrail } from './tree';

export interface SettingsFrameProps {
  readonly page: string;
  readonly title?: string;
  readonly detail?: boolean;
  readonly trail?: readonly Crumb[];
  readonly actions?: readonly HeaderAction[];
  readonly overflow?: readonly MenuItem[];
  readonly search?: boolean;
  readonly banner?: ReactNode;
  readonly maxWidth?: ScreenProps['maxWidth'];
  readonly primaryAction?: PrimaryActionProps;
  readonly scroll?: boolean;
  readonly children: ReactNode;
}

type HeaderChrome = Pick<SettingsFrameProps, 'title' | 'actions' | 'overflow' | 'search'>;

function crumbsOf(page: string, detail: boolean, trail: readonly Crumb[]): readonly Crumb[] {
  const crumbs = settingsTrail(page);
  return [...(detail ? crumbs : crumbs.slice(0, -1)), ...trail];
}

function FrameHeader({
  page,
  detail,
  trail,
  chrome: { title, ...chrome },
}: Pick<SettingsFrameProps, 'page'> & {
  readonly detail: boolean;
  readonly trail: readonly Crumb[];
  readonly chrome: HeaderChrome;
}): ReactNode {
  const { split } = useSizeClass();
  const origin = useSettingsOrigin();
  const definition = settingsPage(page);
  useSettingsParentBack(page);
  const topLevel = split && !detail && definition?.parent === null && !origin;
  return (
    <PageHeader
      title={title ?? definition?.title ?? 'Settings'}
      {...(topLevel ? { back: false } : {})}
      breadcrumbs={crumbsOf(page, detail, trail)}
      {...chrome}
    />
  );
}

export function SettingsFrame({
  primaryAction,
  children,
  detail = false,
  trail = [],
  scroll = true,
  maxWidth = 'reading',
  banner,
  page,
  ...chrome
}: SettingsFrameProps): ReactNode {
  return (
    <Screen
      header={<FrameHeader page={page} detail={detail} trail={trail} chrome={chrome} />}
      maxWidth={maxWidth}
      scroll={scroll}
      {...(banner === undefined ? {} : { banner })}
      {...(primaryAction === undefined ? {} : { primaryAction })}
    >
      {children}
    </Screen>
  );
}
