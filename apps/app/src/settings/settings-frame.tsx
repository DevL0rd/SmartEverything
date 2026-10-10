import type { ReactNode } from 'react';
import type { Crumb } from '../components/breadcrumbs';
import { PageHeader, type HeaderAction } from '../components/page-header';
import type { PrimaryActionProps } from '../components/primary-action';
import { Screen } from '../components/screen';
import { useSizeClass } from '../design/size-class';
import { mountOf } from './mounts';
import { useSettingsParentBack } from './settings-back';
import { settingsPage, settingsTrail } from './tree';

export interface SettingsFrameProps {
  readonly page: string;
  readonly title?: string;
  readonly detail?: boolean;
  readonly trail?: readonly Crumb[];
  readonly actions?: readonly HeaderAction[];
  readonly primaryAction?: PrimaryActionProps;
  readonly scroll?: boolean;
  readonly children: ReactNode;
}

function crumbsOf(page: string, detail: boolean, trail: readonly Crumb[]): readonly Crumb[] {
  const crumbs = settingsTrail(page);
  return [...(detail ? crumbs : crumbs.slice(0, -1)), ...trail];
}

function FrameHeader({
  page,
  title,
  detail,
  trail,
  actions,
}: Omit<SettingsFrameProps, 'children' | 'primaryAction' | 'detail' | 'trail'> & {
  readonly detail: boolean;
  readonly trail: readonly Crumb[];
}): ReactNode {
  const { split } = useSizeClass();
  const definition = settingsPage(page);
  useSettingsParentBack(page);
  const topLevel = split && !detail && definition?.parent === null && mountOf(page) === null;
  return (
    <PageHeader
      title={title ?? definition?.title ?? 'Settings'}
      {...(topLevel ? { back: false } : {})}
      breadcrumbs={crumbsOf(page, detail, trail)}
      {...(actions === undefined ? {} : { actions })}
    />
  );
}

export function SettingsFrame({
  primaryAction,
  children,
  detail = false,
  trail = [],
  scroll = true,
  ...header
}: SettingsFrameProps): ReactNode {
  return (
    <Screen
      header={<FrameHeader {...header} detail={detail} trail={trail} />}
      maxWidth="reading"
      scroll={scroll}
      {...(primaryAction === undefined ? {} : { primaryAction })}
    >
      {children}
    </Screen>
  );
}
