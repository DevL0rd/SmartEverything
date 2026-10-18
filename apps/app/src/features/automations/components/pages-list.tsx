import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { plural } from '../../../format/text';
import { useRows } from '../../../store/selectors';
import { useScheduledRows } from '../scheduled/use-scheduled';
import { upcomingOf } from '../scheduled/view';

export function PagesList({ pathname }: { readonly pathname: string | null }): ReactNode {
  const scenes = useRows('scenes').length;
  const upcoming = upcomingOf(useScheduledRows()).length;
  const at = (prefix: string): boolean => pathname?.startsWith(prefix) === true;
  return (
    <List inset>
      <NavRow
        title="Values"
        icon="customize"
        href={href.automationValues()}
        selected={at('/automations/values')}
      />
      <NavRow
        title="Reusable steps"
        icon="layers"
        href={href.automationSequences()}
        selected={at('/automations/sequences')}
      />
      <NavRow
        title="Scenes"
        icon="sparkles"
        value={scenes === 0 ? 'None yet' : plural(scenes, 'scene')}
        href={href.scenes()}
        selected={at('/automations/scenes')}
      />
      <NavRow
        title="One-off timers"
        icon="timer"
        value={upcoming === 0 ? 'None yet' : `${String(upcoming)} coming up`}
        href={href.scheduled()}
        selected={at('/automations/scheduled')}
      />
      <NavRow
        title="Week view"
        icon="calendar"
        href={href.automationSchedule()}
        selected={pathname === '/automations/schedule'}
      />
      <NavRow
        title="Run history"
        icon="activity"
        href={href.automationRuns()}
        selected={pathname === '/automations/runs'}
      />
    </List>
  );
}
