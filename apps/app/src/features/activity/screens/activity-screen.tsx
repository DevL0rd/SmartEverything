import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { Select } from '../../../components/select';
import { VirtualList } from '../../../components/virtual-list';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { ActivityRow } from '../components/activity-row';
import { CATEGORY_LABELS, categoriesOf, useActivity } from '../data/use-activity';
import type { ActivityCategory } from '../model/atoms';
import type { ActivityItem } from '../model/coalesce';
import { byDay } from '../model/days';

type Shown = ActivityCategory | 'all';

function Filter({
  items,
  value,
  onChange,
}: {
  readonly items: readonly ActivityItem[];
  readonly value: Shown;
  readonly onChange: (value: Shown) => void;
}): ReactNode {
  const categories = categoriesOf(items);
  if (categories.length < 2) {
    return null;
  }
  const options = [
    { value: 'all' as const, label: 'All activity' },
    ...categories.map((category) => ({ value: category, label: CATEGORY_LABELS[category] })),
  ];
  return (
    <View className="max-w-dialog px-gutter pb-2 pt-1">
      <Select<Shown> label="Show" options={options} value={value} onChange={onChange} />
    </View>
  );
}

export function ActivityScreen(): ReactNode {
  const items = useActivity();
  const [shown, setShown] = useState<Shown>('all');
  const now = useMinute();
  const zone = useSettings().time_zone;
  const visible = shown === 'all' ? items : items.filter((item) => item.category === shown);
  const sections = byDay(visible, now, zone).map((day) => ({
    key: day.key,
    title: day.title,
    data: day.items,
  }));
  return (
    <Screen header={<PageHeader title="Activity" />} scroll={false}>
      <View className="w-full max-w-reading flex-1 self-center">
        <VirtualList
          header={<Filter items={items} value={shown} onChange={setShown} />}
          sections={sections}
          keyOf={(item) => item.id}
          renderItem={(item) => <ActivityRow item={item} flush />}
          empty={
            <EmptyState
              icon="activity"
              title="No activity yet"
              body="Changes and events show up here as they happen."
            />
          }
        />
      </View>
    </Screen>
  );
}
