import type { PlannerAlarmRow, PlannerWatchLink } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ReasonLine, type ReasonAction } from '../../../components/reason-line';
import { useRow } from '../../../store/selectors';
import { watchLineOf } from './alarm-text';

export interface WatchStateLineProps {
  readonly link: PlannerWatchLink;
  readonly action?: ReasonAction;
}

export function useWatchName(deviceId: string): string {
  return useRow('devices', deviceId)?.label ?? 'Watch';
}

export function WatchStateLine({ link, action }: WatchStateLineProps): ReactNode {
  const line = watchLineOf(link, useWatchName(link.deviceId));
  return (
    <View className="rounded-md bg-surface-2 px-3 py-2">
      <ReasonLine
        text={line.text}
        icon="watch"
        tone={line.tone}
        {...(action === undefined ? {} : { action })}
      />
    </View>
  );
}

export function WatchStateLines({
  alarm,
}: {
  readonly alarm: Pick<PlannerAlarmRow, 'watch'>;
}): ReactNode {
  if (alarm.watch.length === 0) return null;
  return (
    <View className="gap-2">
      {alarm.watch.map((link) => (
        <WatchStateLine key={link.deviceId} link={link} />
      ))}
    </View>
  );
}
