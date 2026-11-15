import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { FilterChip } from '../../../components/filter-chip';
import { ChipRow } from '../../../components/chip-row';
import { ChoiceChip } from '../../../components/choice-chip';
import { DRIVE_FILTERS, DRIVE_FILTER_LOOK, driveFilterCounts } from '../model/drive-chip';
import {
  chipCountsOf,
  driveCountsOf,
  NO_FILTER,
  TRASH_CHIPS,
  type TrashDriveOf,
  type TrashFilter,
} from './trash-filter';
import { itemsText, type TrashItem } from './trash-model';

export interface TrashFilterRowProps {
  readonly items: readonly TrashItem[];
  readonly filter: TrashFilter;
  readonly onFilter: (filter: TrashFilter) => void;
  readonly driveOf: TrashDriveOf;
  readonly trailing?: ReactNode;
}

function DriveChoice({ items, filter, onFilter, driveOf }: TrashFilterRowProps): ReactNode {
  const all = driveFilterCounts(items, (item) => ({ key: driveOf(item) }));
  const present = DRIVE_FILTERS.filter((drive) => drive !== 'all' && all[drive] > 0);
  if (present.length < 2 && filter.drive === 'all') return null;
  const counts = driveCountsOf(items, filter, driveOf);
  const options = DRIVE_FILTERS.filter(
    (drive) => drive === 'all' || drive === filter.drive || all[drive] > 0,
  ).map((drive) => ({
    value: drive,
    label: DRIVE_FILTER_LOOK[drive].label,
    description: itemsText(counts[drive]),
  }));
  return (
    <View className="flex-row items-center gap-2">
      <View aria-hidden className="h-6 w-px bg-outline-variant" />
      <ChoiceChip
        label="Drive"
        icon={DRIVE_FILTER_LOOK[filter.drive].icon}
        options={options}
        value={filter.drive}
        all="all"
        onChange={(drive) => {
          onFilter({ ...filter, drive });
        }}
      />
    </View>
  );
}

export function TrashFilterRow(props: TrashFilterRowProps): ReactNode {
  const { items, filter, onFilter, driveOf, trailing } = props;
  const counts = chipCountsOf(items, filter, driveOf);
  const chips = (
    <ChipRow label="Show in trash">
      {TRASH_CHIPS.map((entry) => (
        <FilterChip
          key={entry.chip}
          label="Show"
          value={entry.label}
          count={counts[entry.chip]}
          active={entry.chip === filter.chip}
          singleChoice
          onPress={() => {
            onFilter({ ...filter, chip: entry.chip });
          }}
        />
      ))}
      <DriveChoice {...props} />
    </ChipRow>
  );
  if (trailing === undefined) return chips;
  return (
    <View className="flex-row items-center gap-gutter">
      <View className="min-w-0 flex-1">{chips}</View>
      {trailing}
    </View>
  );
}

export function TrashNoMatch({
  onClear,
}: {
  readonly onClear: (filter: TrashFilter) => void;
}): ReactNode {
  return (
    <View className="pt-6">
      <EmptyState
        icon="search"
        title="Nothing in Trash matches"
        body="Try another name or drive, or show everything in Trash."
        action={
          <Button
            label="Show everything"
            variant="tonal"
            onPress={() => {
              onClear(NO_FILTER);
            }}
          />
        }
      />
    </View>
  );
}
