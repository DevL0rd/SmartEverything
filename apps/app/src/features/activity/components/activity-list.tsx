import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { List } from '../../../components/section';
import { PAGE_SIZE, ShowMore } from '../../../components/show-more';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { useActivity } from '../data/use-activity';
import { byDay } from '../model/days';
import { ActivityRow } from './activity-row';

export interface ActivityListProps {
  readonly deviceId?: string;
}

export function ActivityList({ deviceId }: ActivityListProps): ReactNode {
  const all = useActivity(deviceId === undefined ? {} : { deviceId });
  const [limit, setLimit] = useState(PAGE_SIZE);
  const items = all.slice(0, limit);
  const now = useMinute();
  const zone = useSettings().time_zone;
  if (all.length === 0) {
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
      <ShowMore
        remaining={all.length - items.length}
        onPress={() => {
          setLimit(limit + PAGE_SIZE);
        }}
      />
    </View>
  );
}
