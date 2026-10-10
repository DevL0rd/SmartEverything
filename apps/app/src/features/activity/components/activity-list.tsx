import type { ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { List } from '../../../components/section';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { useActivity } from '../data/use-activity';
import { byDay } from '../model/days';
import { ActivityRow } from './activity-row';

export interface ActivityListProps {
  readonly deviceId?: string;
}

export function ActivityList({ deviceId }: ActivityListProps): ReactNode {
  const items = useActivity(deviceId === undefined ? {} : { deviceId });
  const now = useMinute();
  const zone = useSettings().time_zone;
  if (items.length === 0) {
    return (
      <EmptyState
        icon="activity"
        title="No activity yet"
        body="Changes and events show up here as they happen."
      />
    );
  }
  return (
    <View className="gap-section-gap">
      {byDay(items, now, zone).map((day) => (
        <List key={day.key} title={day.title} inset>
          {day.items.map((item) => (
            <ActivityRow key={item.id} item={item} withName={deviceId === undefined} />
          ))}
        </List>
      ))}
    </View>
  );
}
