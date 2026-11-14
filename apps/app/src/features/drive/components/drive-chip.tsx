import type { ReactNode } from 'react';
import { Badge } from '../../../components/badge';
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

export function DriveFilterChips({ value, counts, onChange }: DriveFilterChipsProps): ReactNode {
  return DRIVE_FILTERS.filter(
    (filter) => filter === 'all' || filter === value || counts[filter] > 0,
  ).map((filter) => (
    <FilterChip
      key={filter}
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
  ));
}
