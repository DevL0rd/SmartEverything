import type { ReactNode } from 'react';
import type { Crumb } from '../../../components/breadcrumbs';
import { HeaderStatusProvider, useHeaderStatus } from '../../../components/header-status';
import type { HeaderAction } from '../../../components/page-header';
import type { PageSettingsLink } from '../../../components/page-settings-button';
import type { PrimaryActionProps } from '../../../components/primary-action';
import { useSettingEnv } from '../../../settings/env';
import type { DriveSection } from '../model/section-routes';
import { driveSettingsHref } from '../settings/sections';
import { SyncPill } from './sync-pill';

export interface DriveHeaderProps {
  readonly section: DriveSection;
  readonly title?: string;
  readonly subtitle?: string;
  readonly breadcrumbs?: readonly Crumb[];
  readonly actions?: readonly HeaderAction[];
  readonly primary?: PrimaryActionProps;
}

export interface DriveHeaderSlots {
  readonly title: string;
  readonly subtitle?: string;
  readonly breadcrumbs?: readonly Crumb[];
  readonly actions: readonly HeaderAction[];
  readonly settings: PageSettingsLink;
  readonly primaryAction?: PrimaryActionProps;
}

const DRIVE_TITLE = 'Drive';

const NO_ACTIONS: readonly HeaderAction[] = [];

export function secondaryActionsOf(actions: readonly HeaderAction[]): readonly HeaderAction[] {
  return actions.map((action) =>
    action.primary === true ? { ...action, primary: false } : action,
  );
}

export function useDriveHeader(header: DriveHeaderProps): DriveHeaderSlots {
  const env = useSettingEnv();
  return {
    title: header.title ?? DRIVE_TITLE,
    actions: secondaryActionsOf(header.actions ?? NO_ACTIONS),
    settings: { href: driveSettingsHref(header.section, env), label: 'Drive settings' },
    ...(header.subtitle === undefined ? {} : { subtitle: header.subtitle }),
    ...(header.breadcrumbs === undefined ? {} : { breadcrumbs: header.breadcrumbs }),
    ...(header.primary === undefined ? {} : { primaryAction: header.primary }),
  };
}

export function DriveHeaderStatus({
  pill,
  children,
}: {
  readonly pill: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const outer = useHeaderStatus();
  if (!pill) return children;
  return (
    <HeaderStatusProvider
      value={
        <>
          <SyncPill />
          {outer}
        </>
      }
    >
      {children}
    </HeaderStatusProvider>
  );
}
