import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { DateNav } from '../../../components/date-nav';
import { useSizeClass } from '../../../design/size-class';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { dayKeyOf, startOfDayKey } from '../../../format/time';
import { type Range } from '../model/window';
import { SyncChip } from './sync-chip';

const RANGE_OPTIONS: readonly SegmentedOption<Range>[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

export interface FitnessToolbarProps {
  readonly day: string;
  readonly today: string;
  readonly range: Range;
  readonly ranges?: readonly Range[];
}

export function FitnessToolbar({ day, today, range, ranges }: FitnessToolbarProps): ReactNode {
  const router = useRouter();
  const options = RANGE_OPTIONS.filter((option) => ranges?.includes(option.value) ?? false);
  const { split } = useSizeClass();
  const segmented =
    options.length === 0 ? null : (
      <Segmented
        options={options}
        value={range}
        label="Period"
        onChange={(next) => {
          router.setParams({ range: next });
        }}
      />
    );
  return (
    <View className="w-full gap-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <DateNav
          value={new Date(startOfDayKey(day))}
          range={range}
          max={new Date(startOfDayKey(today))}
          onChange={(date) => {
            router.setParams({ day: dayKeyOf(date.getTime()) });
          }}
        />
        {split ? segmented : null}
        <View className="flex-1" />
        <SyncChip compact={!split} />
      </View>
      {split ? null : segmented}
    </View>
  );
}
