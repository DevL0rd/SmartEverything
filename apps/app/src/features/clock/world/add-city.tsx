import type { ReactNode } from 'react';
import type { Rect } from '../../../components/anchor';
import { SelectPicker } from '../../../components/select-picker';
import { cityOptionsOf, pickableZones, type WorldCity } from './cities';

export interface AddCityProps {
  readonly anchor: Rect | null;
  readonly cities: readonly WorldCity[];
  readonly now: number;
  readonly homeZone: string;
  readonly onAdd: (zone: string) => void;
  readonly onClose: () => void;
}

export function AddCityPicker({
  anchor,
  cities,
  now,
  homeZone,
  onAdd,
  onClose,
}: AddCityProps): ReactNode {
  const options =
    anchor === null
      ? []
      : cityOptionsOf(
          pickableZones(),
          cities.map((city) => city.zone),
          now,
          homeZone,
        );
  return (
    <SelectPicker
      label="Add city"
      options={options}
      value={null}
      anchor={anchor}
      searchable
      onPick={onAdd}
      onClose={onClose}
    />
  );
}
