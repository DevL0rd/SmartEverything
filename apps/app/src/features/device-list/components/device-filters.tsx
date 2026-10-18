import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DEVICE_FAMILIES } from '@smarteverything/domain';
import { ChoiceChip } from '../../../components/choice-chip';
import { FilterChip } from '../../../components/filter-chip';
import { HScroller } from '../../../components/h-scroller';
import type { IconName } from '../../../components/icon-glyphs';
import { SearchField } from '../../../components/search-field';
import type { SelectOption } from '../../../components/select-picker';
import { familyIcon } from '../../device-visuals';
import type { DeviceQuery } from '../model/device-filter';
import { FAMILY_GROUPS } from '../model/families';

export interface DeviceFiltersProps {
  readonly query: DeviceQuery;
  readonly rooms: readonly SelectOption<string>[];
  readonly kinds: readonly SelectOption<string>[];
  readonly all: string;
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

export function DeviceFilters({
  query,
  rooms,
  kinds,
  all,
  onChange,
}: DeviceFiltersProps): ReactNode {
  return (
    <View className="gap-2 pb-2">
      <SearchField
        value={query.text}
        onChange={(text) => {
          onChange({ ...query, text });
        }}
        placeholder="Find a device"
      />
      <HScroller label="Filters">
        {rooms.length > 2 ? (
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
        ) : null}
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
      </HScroller>
    </View>
  );
}
