import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { FilterChip } from '../../../components/filter-chip';
import { SearchField } from '../../../components/search-field';
import { cn } from '../../../design/cn';
import { ChipRow } from '../../nas/frame';
import {
  chipCountsOf,
  isFiltered,
  NO_FILTER,
  shownText,
  trashChipsOf,
  type TrashFilter,
} from './trash-filter';
import type { TrashItem } from './trash-model';

export interface TrashFilterRowProps {
  readonly items: readonly TrashItem[];
  readonly shown: number;
  readonly filter: TrashFilter;
  readonly onFilter: (filter: TrashFilter) => void;
  readonly owner: boolean;
  readonly wide: boolean;
}

export function TrashFilterRow(props: TrashFilterRowProps): ReactNode {
  const { items, shown, filter, onFilter, owner, wide } = props;
  const counts = chipCountsOf(items, filter.query);
  const active = isFiltered(filter);
  return (
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
          {trashChipsOf(owner).map((entry) => (
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
        body="Try another name or show everything in Trash."
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
