import type { PlannerAlarmRow, PlannerWatchLink } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useRow } from '../../../store/selectors';
import { watchLineOf } from './alarm-text';

export function useWatchName(deviceId: string): string {
  return useRow('devices', deviceId)?.label ?? 'Watch';
}

export function WatchStateLine({ link }: { readonly link: PlannerWatchLink }): ReactNode {
  const line = watchLineOf(link, useWatchName(link.deviceId));
  return (
    <View
      accessibilityRole="summary"
      className="flex-row items-start gap-2 rounded-md bg-surface-2 px-3 py-2"
    >
      <View className="pt-px">
        <Icon name="watch" size={16} tone={line.tone} />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="footnote">{line.title}</Text>
        {line.detail === null ? null : (
          <Text variant="footnote" tone="variant">
            {line.detail}
          </Text>
        )}
      </View>
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
