import type { PlannerAlarmRow, PlannerWatchLink } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useDeviceLabel } from '../../../store/selectors';
import { watchLineOf } from './alarm-text';

export const REMOVED_WATCH = 'Removed watch';

export function useWatchName(deviceId: string): string | null {
  return useDeviceLabel(deviceId);
}

export function WatchStateLine({ link }: { readonly link: PlannerWatchLink }): ReactNode {
  const name = useWatchName(link.deviceId);
  const line = watchLineOf(link, name ?? REMOVED_WATCH);
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
  const attention = alarm.watch.filter((link) => link.state !== 'synced');
  if (attention.length === 0) return null;
  return (
    <View className="gap-2">
      {attention.map((link) => (
        <WatchStateLine key={link.deviceId} link={link} />
      ))}
    </View>
  );
}
