import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { FilterChip } from '../../../components/filter-chip';
import { SearchField } from '../../../components/search-field';
import { cn } from '../../../design/cn';
import { ChipRow } from '../../../components/library-frame';
import { DriveFilterChips } from '../components/drive-chip';
import { driveFilterCounts } from '../model/drive-chip';
import {
  chipCountsOf,
  isFiltered,
  NO_FILTER,
  shownText,
  TRASH_CHIPS,
  type TrashDriveOf,
  type TrashFilter,
} from './trash-filter';
import type { TrashItem } from './trash-model';

export interface TrashFilterRowProps {
  readonly items: readonly TrashItem[];
  readonly shown: number;
  readonly filter: TrashFilter;
  readonly onFilter: (filter: TrashFilter) => void;
  readonly driveOf: TrashDriveOf;
  readonly wide: boolean;
}

function DriveRow({ items, filter, onFilter, driveOf }: TrashFilterRowProps): ReactNode {
  const counts = driveFilterCounts(items, (item) => ({ key: driveOf(item) }));
  const drives = [counts.mine, counts['shared-drive'], counts['with-me']].filter(
    (total) => total > 0,
  ).length;
  if (drives < 2 && filter.drive === 'all') return null;
  return (
    <ChipRow label="Show from drive">
      <DriveFilterChips
        value={filter.drive}
        counts={counts}
        onChange={(drive) => {
          onFilter({ ...filter, drive });
        }}
      />
    </ChipRow>
  );
}

export function TrashFilterRow(props: TrashFilterRowProps): ReactNode {
  const { items, shown, filter, onFilter, driveOf, wide } = props;
  const counts = chipCountsOf(items, filter, driveOf);
  const active = isFiltered(filter);
  return (
    <View className="gap-2">
      <View className={cn('gap-2', wide && 'flex-row items-center gap-3')}>
        <View className={wide ? 'w-72' : 'w-full'}>
          <SearchField
            value={filter.query}
            onChange={(query) => {
              onFilter({ ...filter, query });
            }}
            placeholder="Find in trash"
            active={filter.query.trim() !== ''}
            {...(active ? { status: shownText(shown, items.length) } : {})}
          />
        </View>
        <View className="min-w-0 flex-1">
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
          </ChipRow>
        </View>
      </View>
      <DriveRow {...props} />
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
