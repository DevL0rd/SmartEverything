import { mainPageSettings } from '../../../app-shell/main-pages';
import type { ReactElement, ReactNode } from 'react';
import type { PrimaryActionProps } from '../../../components/primary-action';
import { PageHeader, type HeaderAction, type HeaderEditing } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { HEALTH_CONNECT_ON_DEVICE } from '../data/health-connect';
import { useHealthConnect } from '../data/use-health-connect';
import { FitnessTabs, type FitnessTab } from './fitness-tabs';

export interface FitnessFrameProps {
  readonly tab: FitnessTab;
  readonly width: 'dashboard' | 'detail';
  readonly toolbar: ReactNode;
  readonly actions?: readonly HeaderAction[];
  readonly editing?: HeaderEditing | null;
  readonly primaryAction?: PrimaryActionProps | undefined;
  readonly children: ReactNode;
}

function RefreshableScreen({
  header,
  width,
  primaryAction,
  children,
}: {
  readonly header: ReactElement;
  readonly width: 'dashboard' | 'detail';
  readonly primaryAction: PrimaryActionProps | undefined;
  readonly children: ReactNode;
}): ReactNode {
  const controls = useHealthConnect();
  const connected = controls.status.data?.sdk === 'available';
  return (
    <Screen
      header={header}
      maxWidth={width}
      {...(connected ? { onRefresh: controls.syncNow } : {})}
      refreshing={controls.busy === 'sync'}
      {...(primaryAction === undefined ? {} : { primaryAction })}
    >
      {children}
    </Screen>
  );
}

export function FitnessFrame({
  tab,
  width,
  toolbar,
  actions = [],
  editing = null,
  primaryAction,
  children,
}: FitnessFrameProps): ReactNode {
  const header = (
    <PageHeader
      title="Fitness"
      settings={mainPageSettings('fitness')}
      back={false}
      actions={actions}
      editing={editing}
      below={<FitnessTabs active={tab} />}
    />
  );
  const body = (
    <>
      {toolbar}
      {children}
    </>
  );
  return HEALTH_CONNECT_ON_DEVICE ? (
    <RefreshableScreen header={header} width={width} primaryAction={primaryAction}>
      {body}
    </RefreshableScreen>
  ) : (
    <Screen
      header={header}
      maxWidth={width}
      {...(primaryAction === undefined ? {} : { primaryAction })}
    >
      {body}
    </Screen>
  );
}
