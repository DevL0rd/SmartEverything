import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import type { View } from 'react-native';
import { measureAnchor, type Rect } from './anchor';
import { FilterChip } from './filter-chip';
import type { IconName } from './icon-glyphs';
import { SelectPicker, type SelectOption } from './select-picker';

const SEARCHABLE_AT = 8;

export interface ChoiceChipProps<T extends string> {
  readonly label: string;
  readonly icon: IconName;
  readonly options: readonly SelectOption<T>[];
  readonly value: T;
  readonly all: T;
  readonly onChange: (value: T) => void;
}

export function ChoiceChip<T extends string>({
  label,
  icon,
  options,
  value,
  all,
  onChange,
}: ChoiceChipProps<T>): ReactNode {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const chosen = options.find((option) => option.value === value);
  return (
    <>
      <FilterChip
        anchorRef={ref}
        label={label}
        value={chosen?.label ?? label}
        icon={icon}
        active={value !== all}
        onPress={() => {
          measureAnchor(ref, setAnchor);
        }}
      />
      <SelectPicker
        label={label}
        options={options}
        value={value}
        anchor={anchor}
        searchable={options.length > SEARCHABLE_AT}
        onClose={() => {
          setAnchor(null);
        }}
        onPick={onChange}
      />
    </>
  );
}
