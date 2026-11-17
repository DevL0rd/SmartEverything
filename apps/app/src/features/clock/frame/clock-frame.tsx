import { background } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { PageShell } from '../../../components/page-shell/page-shell';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import type { ShellAside } from '../../../components/page-shell/shell-types';
import { useSizeClass } from '../../../design/size-class';
import { usePlannerReload, useComposerControl, QuickAddBar, QuickAddComposer } from '../../planner';
import type { ClockSection } from '../model/section-routes';
import { clockMenu, clockSettingsHref } from './clock-menu';
import { clockSectionsOf } from './clock-sections';
import { useHubOffline } from './hub-status';
import { clockComposerKindOf } from './quick-add';
import { CLOCK_QUICK_ADD_TARGET, clockSectionOf } from './sections';

export interface ClockFrameProps {
  readonly section: ClockSection;
  readonly subtitle?: string;
  readonly actions?: readonly ShellAction[];
  readonly scroll?: boolean;
  readonly aside?: ShellAside;
  readonly children: ReactNode;
}

function useRefresh(): { readonly refreshing: boolean; readonly onRefresh: () => void } {
  const reload = usePlannerReload();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = (): void => {
    setRefreshing(true);
    background(
      reload().finally(() => {
        setRefreshing(false);
      }),
      'clock.reload_failed',
    );
  };
  return { refreshing, onRefresh };
}

export function ClockFrame({
  section,
  subtitle,
  actions = [],
  scroll = true,
  aside,
  children,
}: ClockFrameProps): ReactNode {
  const phone = useSizeClass().header === 'large';
  const offline = useHubOffline();
  const refresh = useRefresh();
  const composer = useComposerControl();
  const quickAdd = (
    <QuickAddBar
      target={CLOCK_QUICK_ADD_TARGET}
      hint={clockSectionOf(section).hint}
      onOpen={() => {
        composer.open({ text: '', kind: clockComposerKindOf(section) });
      }}
      disabled={offline}
    />
  );
  return (
    <PageShell
      title={clockSectionOf(section).label}
      back={false}
      actions={actions}
      overflow={clockMenu()}
      settings={{ href: clockSettingsHref(), label: 'Clock settings' }}
      sections={clockSectionsOf(section)}
      scroll={scroll}
      onRefresh={refresh.onRefresh}
      refreshing={refresh.refreshing}
      footer={quickAdd}
      {...(phone ? { footerHides: 'scroll' as const } : {})}
      {...(subtitle === undefined ? {} : { subtitle })}
      {...(aside === undefined ? {} : { aside })}
    >
      {children}
      <QuickAddComposer
        control={composer}
        target={CLOCK_QUICK_ADD_TARGET}
        person={null}
        disabled={offline}
      />
    </PageShell>
  );
}
