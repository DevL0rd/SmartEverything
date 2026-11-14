import type { PlannerAlarmRow, PlannerWatchState } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { NavRow } from '../../../components/rows';
import { useMyWatch } from '../../watches/watch-glance';
import { usePlannerAlarms } from '../data';
import { useOwnPrefs } from './preferences';

const WATCH_SETTINGS_PAGE = 'health/watch-settings';

export interface WatchSyncInput {
  readonly watchId: string | null;
  readonly sync: boolean;
  readonly alarms: readonly Pick<PlannerAlarmRow, 'watch'>[];
}

export function watchSyncText({ watchId, sync, alarms }: WatchSyncInput): string {
  if (watchId === null) return 'No watch';
  if (!sync) return 'Alarms not synced';
  const states = alarms.flatMap((alarm) =>
    alarm.watch.filter((link) => link.deviceId === watchId).map((link) => link.state),
  );
  const count = (state: PlannerWatchState): number =>
    states.filter((each) => each === state).length;
  const failed = count('failed');
  if (failed > 0) return `${String(failed)} not saved`;
  const pending = count('pending');
  if (pending > 0) return `${String(pending)} waiting`;
  const synced = count('synced');
  return synced === 0 ? 'Sync on' : `${String(synced)} synced`;
}

export function WatchSettingsRow(): ReactNode {
  const watch = useMyWatch();
  const prefs = useOwnPrefs();
  const alarms = usePlannerAlarms(null);
  return (
    <NavRow
      title="Watch settings"
      icon="watch"
      {...(watch === null ? {} : { subtitle: watch.label })}
      href={href.settings.page(WATCH_SETTINGS_PAGE)}
      {...(prefs === undefined
        ? {}
        : {
            value: watchSyncText({
              watchId: watch?.id ?? null,
              sync: prefs.watch.watch_alarm_sync,
              alarms,
            }),
          })}
    />
  );
}
