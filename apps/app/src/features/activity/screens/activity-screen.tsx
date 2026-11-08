import { Logger } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
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
import { byDay } from '../model/days';

const log = new Logger('app.activity');

type Shown = ActivityCategory | 'all';

function Filter({
  categories,
  value,
  onChange,
}: {
  readonly categories: readonly ActivityCategory[];
  readonly value: Shown;
  readonly onChange: (value: Shown) => void;
}): ReactNode {
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
  const categories = categoriesOf(items);
  const active = shown === 'all' || categories.includes(shown) ? shown : 'all';
  if (active !== shown) setShown(active);
  const now = useMinute();
  const zone = useSettings().time_zone;
  useEffect(() => {
    log.info('activity_screen.mounted', {});
    return (): void => {
      log.info('activity_screen.unmounted', {});
    };
  }, []);
  useEffect(() => {
    log.debug('activity_screen.filtered', { shown: active, items: items.length });
  }, [active, items.length]);
  const visible = active === 'all' ? items : items.filter((item) => item.category === active);
  const sections = byDay(visible, now, zone).map((day) => ({
    key: day.key,
    title: day.title,
    data: day.items,
  }));
  return (
    <Screen header={<PageHeader title="Activity" />} scroll={false}>
      <VirtualList
        header={<Filter categories={categories} value={active} onChange={setShown} />}
        sections={sections}
        keyOf={(item) => item.id}
        renderItem={(item) => <ActivityRow item={item} flush timeline />}
        empty={
          <EmptyState
            icon="activity"
            title="No activity yet"
            body="Changes and events show up here as they happen."
          />
        }
      />
    </Screen>
  );
}
