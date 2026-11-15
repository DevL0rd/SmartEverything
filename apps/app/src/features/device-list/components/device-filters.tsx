import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { DEVICE_FAMILIES } from '@smarteverything/domain';
import { ChoiceChip } from '../../../components/choice-chip';
import { FilterChip } from '../../../components/filter-chip';
import { HScroller } from '../../../components/h-scroller';
import type { IconName } from '../../../components/icon-glyphs';
import type { SelectOption } from '../../../components/select-picker';
import { familyIcon } from '../../device-visuals';
import type { DeviceQuery } from '../model/device-filter';
import { FAMILY_GROUPS } from '../model/families';
import { SelectionChip, type MapSelectionChip } from './map-selection';

export interface DeviceFiltersProps {
  readonly query: DeviceQuery;
  readonly rooms: readonly SelectOption<string>[];
  readonly kinds: readonly SelectOption<string>[];
  readonly all: string;
  readonly selection: MapSelectionChip | null;
  readonly onChange: (query: DeviceQuery) => void;
}

const ANY_KIND_ICON: IconName = 'grid';

function kindIcon(kind: string, all: string): IconName {
  const family = DEVICE_FAMILIES.find((candidate) => FAMILY_GROUPS[candidate].one === kind);
  return kind === all || family === undefined ? ANY_KIND_ICON : familyIcon(family);
}

function StatusChip({
  query,
  onChange,
}: Pick<DeviceFiltersProps, 'query' | 'onChange'>): ReactNode {
  return (
    <FilterChip
      label="Status"
      value={query.offline ? 'Offline only' : 'Any status'}
      icon="wifi"
      active={query.offline}
      onPress={() => {
        onChange({ ...query, offline: !query.offline });
      }}
    />
  );
}

type FilterChipsProps = DeviceFiltersProps & {
  readonly overflows: boolean;
  readonly measure: (event: LayoutChangeEvent) => void;
};

function RoomFilter({
  query,
  rooms,
  all,
  selection,
  onChange,
}: Pick<FilterChipsProps, 'query' | 'rooms' | 'all' | 'selection' | 'onChange'>): ReactNode {
  if (selection !== null) return <SelectionChip chip={selection} />;
  if (rooms.length <= 2) return null;
  return (
    <ChoiceChip
      label="Room"
      icon="sofa"
      options={rooms}
      value={query.room}
      all={all}
      onChange={(room) => {
        onChange({ ...query, room });
      }}
    />
  );
}

function FilterChips({
  query,
  rooms,
  kinds,
  all,
  selection,
  onChange,
  measure,
  overflows,
}: FilterChipsProps): ReactNode {
  return (
    <HScroller label="Filters" arrows={overflows} fade={overflows}>
      <View className="flex-row gap-2" onLayout={measure}>
        <RoomFilter {...{ query, rooms, all, selection, onChange }} />
        <ChoiceChip
          label="Kind"
          icon={kindIcon(query.kind, all)}
          options={kinds}
          value={query.kind}
          all={all}
          onChange={(kind) => {
            onChange({ ...query, kind });
          }}
        />
        <StatusChip query={query} onChange={onChange} />
      </View>
    </HScroller>
  );
}

export function DeviceFilters(props: DeviceFiltersProps): ReactNode {
  const [width, setWidth] = useState(0);
  const [chips, setChips] = useState(0);
  return (
    <View
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      <FilterChips
        {...props}
        overflows={width > 0 && chips > width}
        measure={(event) => {
          setChips(Math.ceil(event.nativeEvent.layout.width));
        }}
      />
    </View>
  );
}
