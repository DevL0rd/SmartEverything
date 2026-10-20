import type { ReactNode } from 'react';
import type { SettingsProps } from '../../toothbrush/settings/settings-props';
import { HeadAlertsList } from './head-alerts-list';
import { LiveList } from './live-list';
import { LookList } from './look-list';
import { OnHandleList } from './on-handle-list';

export function OralbHandleSettings(props: SettingsProps): ReactNode {
  return (
    <>
      <LiveList {...props} />
      <HeadAlertsList {...props} />
      <OnHandleList {...props} />
      <LookList {...props} />
    </>
  );
}
