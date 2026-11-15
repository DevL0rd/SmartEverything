import type { ReactNode } from 'react';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { PageShell } from '../../../components/page-shell/page-shell';
import type { ShellAction, ShellEditing } from '../../../components/page-shell/shell-actions';
import type { PrimaryActionProps } from '../../../components/primary-action';
import { useToday } from '../data/day';
import { HEALTH_CONNECT_ON_DEVICE } from '../data/health-connect';
import { useHealthPresence } from '../data/presence';
import { useSyncControls } from '../data/use-health-connect';
import { fitnessSectionsOf, fitnessTitleOf } from './fitness-sections';
import type { FitnessTab } from '../model/section-routes';

export interface FitnessShellProps {
  readonly tab: FitnessTab;
  readonly toolbar?: ReactNode;
  readonly actions?: readonly ShellAction[];
  readonly editing?: ShellEditing | null;
  readonly primaryAction?: PrimaryActionProps | undefined;
  readonly children: ReactNode;
}

interface ShellRefresh {
  readonly onRefresh?: () => void;
  readonly refreshing: boolean;
}

function useDeviceRefresh(): ShellRefresh {
  const controls = useSyncControls();
  return {
    ...(controls.available ? { onRefresh: controls.syncNow } : {}),
    refreshing: controls.busy === 'sync',
  };
}

function useNoRefresh(): ShellRefresh {
  return { refreshing: false };
}

const useFitnessRefresh = HEALTH_CONNECT_ON_DEVICE ? useDeviceRefresh : useNoRefresh;

export function FitnessShell({
  tab,
  toolbar,
  actions = [],
  editing = null,
  primaryAction,
  children,
}: FitnessShellProps): ReactNode {
  const presence = useHealthPresence(useToday());
  const refresh = useFitnessRefresh();
  return (
    <PageShell
      title={fitnessTitleOf(tab)}
      settings={mainPageSettings('fitness')}
      back={false}
      sections={fitnessSectionsOf(tab, presence.domains)}
      actions={actions}
      editing={editing}
      {...refresh}
      {...(toolbar === undefined ? {} : { toolbar })}
      {...(primaryAction === undefined ? {} : { primaryAction })}
    >
      {children}
    </PageShell>
  );
}
