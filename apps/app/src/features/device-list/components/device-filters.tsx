import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ChoiceChip } from '../../../components/choice-chip';
import { SearchField } from '../../../components/search-field';
import type { SelectOption } from '../../../components/select-picker';
import type { DeviceQuery } from '../model/device-filter';

export interface DeviceFiltersProps {
  readonly query: DeviceQuery;
  readonly rooms: readonly SelectOption<string>[];
  readonly kinds: readonly SelectOption<string>[];
  readonly all: string;
  readonly onChange: (query: DeviceQuery) => void;
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
      <View className="flex-row flex-wrap gap-2" accessibilityRole="toolbar">
        {rooms.length > 2 ? (
          <ChoiceChip
            label="Room"
            icon="grid"
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
          icon="bulb"
          options={kinds}
          value={query.kind}
          all={all}
          onChange={(kind) => {
            onChange({ ...query, kind });
          }}
        />
      </View>
    </View>
  );
}
