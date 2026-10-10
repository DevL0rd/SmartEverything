import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { measureAnchor, type Rect } from './anchor';
import { Icon } from './icon';
import { Interactive } from './interactive';
import { SelectPicker, type SelectOption } from './select-picker';
import { Text } from './text';

export type { SelectOption } from './select-picker';

export interface SelectProps<T extends string> {
  readonly label: string;
  readonly options: readonly SelectOption<T>[];
  readonly value: T | null;
  readonly onChange: (value: T) => void;
  readonly placeholder?: string;
  readonly searchable?: boolean;
  readonly disabled?: boolean;
  readonly showLabel?: boolean;
}

function Trigger({
  label,
  shown,
  chosen,
  disabled,
  onOpen,
}: {
  readonly label: string;
  readonly shown: string;
  readonly chosen: boolean;
  readonly disabled: boolean;
  readonly onOpen: () => void;
}): ReactNode {
  return (
    <Interactive
      label={`${label}: ${shown}`}
      disabled={disabled}
      onPress={onOpen}
      className="h-control-h flex-row items-center gap-2 rounded-md border border-outline bg-surface-2 pl-3 pr-2"
      layerClassName="rounded-md"
    >
      <Text variant="body" tone={chosen ? 'default' : 'faint'} className="flex-1" numberOfLines={1}>
        {shown}
      </Text>
      <Icon name="chooser" size={16} />
    </Interactive>
  );
}

export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = 'Choose',
  searchable = false,
  disabled = false,
  showLabel = true,
}: SelectProps<T>): ReactNode {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const chosen = options.find((option) => option.value === value);
  return (
    <View className="gap-1">
      {showLabel ? (
        <Text variant="footnote" tone="variant">
          {label}
        </Text>
      ) : null}
      <View ref={ref} collapsable={false}>
        <Trigger
          label={label}
          shown={chosen?.label ?? placeholder}
          chosen={chosen !== undefined}
          disabled={disabled}
          onOpen={() => {
            measureAnchor(ref, setAnchor);
          }}
        />
      </View>
      <SelectPicker
        label={label}
        options={options}
        value={value}
        anchor={anchor}
        searchable={searchable}
        onPick={onChange}
        onClose={() => {
          setAnchor(null);
        }}
      />
    </View>
  );
}
