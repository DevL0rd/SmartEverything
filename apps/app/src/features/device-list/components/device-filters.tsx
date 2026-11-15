import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { useWindowSize } from '../../../design/size-class';
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
  narrow,
}: Pick<DeviceFiltersProps, 'query' | 'onChange'> & {
  readonly narrow: boolean;
}): ReactNode {
  return (
    <FilterChip
      label="Status"
      value={query.offline ? 'Offline only' : 'Any status'}
      icon={narrow ? undefined : 'wifi'}
      active={query.offline}
      onPress={() => {
        onChange({ ...query, offline: !query.offline });
      }}
    />
  );
}

type FilterChipsProps = DeviceFiltersProps & {
  readonly width: number;
  readonly narrow: boolean;
  readonly overflows: boolean;
  readonly measure: (event: LayoutChangeEvent) => void;
};

function RoomFilter({
  query,
  rooms,
  all,
  selection,
  onChange,
  narrow,
}: Pick<
  FilterChipsProps,
  'query' | 'rooms' | 'all' | 'selection' | 'onChange' | 'narrow'
>): ReactNode {
  if (selection !== null) return <SelectionChip chip={selection} />;
  if (rooms.length <= 2) return null;
  return (
    <ChoiceChip
      label="Room"
      icon={narrow ? undefined : 'sofa'}
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
  width,
  narrow,
  measure,
  overflows,
}: FilterChipsProps): ReactNode {
  const slot = narrow ? 'min-w-0 flex-1' : undefined;
  const hasRoom = selection !== null || rooms.length > 2;
  return (
    <HScroller label="Filters" arrows={overflows} fade={overflows} fadeSurface="bg">
      <View className="flex-row" style={narrow ? { width } : undefined} onLayout={measure}>
        {hasRoom ? (
          <View {...(slot === undefined ? {} : { className: slot })}>
            <RoomFilter {...{ query, rooms, all, selection, onChange, narrow }} />
          </View>
        ) : null}
        <View {...(slot === undefined ? {} : { className: slot })}>
          <ChoiceChip
            label="Kind"
            icon={narrow ? undefined : kindIcon(query.kind, all)}
            options={kinds}
            value={query.kind}
            all={all}
            onChange={(kind) => {
              onChange({ ...query, kind });
            }}
          />
        </View>
        <StatusChip query={query} onChange={onChange} narrow={narrow} />
      </View>
    </HScroller>
  );
}

const NARROW_FILTER_WIDTH = 400;

export function DeviceFilters(props: DeviceFiltersProps): ReactNode {
  const { fontScale } = useWindowSize();
  const [width, setWidth] = useState(0);
  const [chips, setChips] = useState(0);
  const narrow = width > 0 && width < NARROW_FILTER_WIDTH * fontScale;
  return (
    <View
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      <FilterChips
        {...props}
        narrow={narrow}
        width={width}
        overflows={!narrow && width > 0 && chips > width}
        measure={(event) => {
          setChips(Math.ceil(event.nativeEvent.layout.width));
        }}
      />
    </View>
  );
}
