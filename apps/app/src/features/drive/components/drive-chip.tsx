import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { ChipRow } from '../../../components/chip-row';
import type { RevealRange } from '../../../components/h-scroller';
import { FilterChip } from '../../../components/filter-chip';
import {
  DRIVE_FILTERS,
  DRIVE_FILTER_LOOK,
  type DriveChip,
  type DriveFilter,
} from '../model/drive-chip';

export function DriveChipBadge({ chip }: { readonly chip: DriveChip }): ReactNode {
  return <Badge label={chip.label} icon={chip.icon} tone={chip.tone} />;
}

export interface DriveFilterChipsProps {
  readonly value: DriveFilter;
  readonly counts: Readonly<Record<DriveFilter, number>>;
  readonly onChange: (filter: DriveFilter) => void;
}

export function DriveFilterRow({
  label,
  value,
  counts,
  onChange,
}: DriveFilterChipsProps & { readonly label: string }): ReactNode {
  const [ranges, setRanges] = useState<ReadonlyMap<DriveFilter, RevealRange>>(new Map());
  const reveal = ranges.get(value) ?? null;
  return (
    <ChipRow label={label} reveal={reveal}>
      {DRIVE_FILTERS.filter(
        (filter) => filter === 'all' || filter === value || counts[filter] > 0,
      ).map((filter) => (
        <View
          key={filter}
          onLayout={(event) => {
            const { x, width } = event.nativeEvent.layout;
            setRanges((now) => {
              const held = now.get(filter);
              if (held?.x === x && held.width === width) return now;
              return new Map(now).set(filter, { x, width });
            });
          }}
        >
          <FilterChip
            label="Drive"
            value={DRIVE_FILTER_LOOK[filter].label}
            icon={DRIVE_FILTER_LOOK[filter].icon}
            count={counts[filter]}
            active={filter === value}
            singleChoice
            onPress={() => {
              onChange(filter);
            }}
          />
        </View>
      ))}
    </ChipRow>
  );
}
