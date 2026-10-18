import type { ReactNode } from 'react';
import { View } from 'react-native';
import { FilterChip } from '../../../components/filter-chip';
import { HScroller } from '../../../components/h-scroller';
import type { IconName } from '../../../components/icon-glyphs';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { useAnchoredMenu } from '../../../components/menu';
import { SearchField } from '../../../components/search-field';
import { Text } from '../../../components/text';
import {
  CLIENT_FILTERS,
  CLIENT_SORTS,
  FILTER_LABEL,
  SORT_LABEL,
  type ClientFilter,
  type ClientSort,
} from '../client-model';

const FILTER_ICON: Readonly<Record<ClientFilter, IconName>> = {
  online: 'circleCheck',
  wifi: 'wifi',
  wired: 'plug',
  people: 'users',
  blocked: 'ban',
  all: 'list',
};

function SortButton({
  sort,
  onSort,
}: {
  readonly sort: ClientSort;
  readonly onSort: (sort: ClientSort) => void;
}): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(
    CLIENT_SORTS.map((value) => ({
      label: SORT_LABEL[value],
      ...(value === sort ? { icon: 'check' as const } : {}),
      onPress: (): void => {
        onSort(value);
      },
    })),
    'Sort devices',
  );
  return (
    <View ref={ref} collapsable={false}>
      <Interactive
        label={`Sort: ${SORT_LABEL[sort]}`}
        onPress={open}
        className="h-control-h flex-row items-center gap-1 rounded-md bg-surface-3 pl-3 pr-2"
        layerClassName="rounded-md"
      >
        <Text variant="label">Sort</Text>
        <Icon name="chevronDown" size={16} tone="variant" />
      </Interactive>
      {menu}
    </View>
  );
}

export interface ClientControlsProps {
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly sort: ClientSort;
  readonly onSort: (sort: ClientSort) => void;
  readonly filter: ClientFilter;
  readonly onFilter: (filter: ClientFilter) => void;
  readonly counts: Readonly<Record<ClientFilter, number>>;
  readonly band: string | null;
  readonly onClearBand: () => void;
}

export function ClientControls({
  query,
  onQuery,
  sort,
  onSort,
  filter,
  onFilter,
  counts,
  band,
  onClearBand,
}: ClientControlsProps): ReactNode {
  return (
    <View className="gap-3 px-gutter pb-2 pt-2">
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <SearchField
            value={query}
            onChange={onQuery}
            placeholder="Name, address or MAC"
            variant="field"
          />
        </View>
        <SortButton sort={sort} onSort={onSort} />
      </View>
      <HScroller label="Filter devices" fade>
        {CLIENT_FILTERS.map((value) => (
          <FilterChip
            key={value}
            label="Show"
            value={FILTER_LABEL[value]}
            icon={FILTER_ICON[value]}
            count={counts[value]}
            active={filter === value}
            onPress={() => {
              onFilter(value);
            }}
          />
        ))}
        {band === null ? null : (
          <FilterChip label="Band" value={band} icon="wifi" active onPress={onClearBand} />
        )}
      </HScroller>
    </View>
  );
}
