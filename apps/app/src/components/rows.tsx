import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import { measureAnchor, type Rect } from './anchor';
import type { TextRange } from './highlighted';
import type { IconName } from './icon';
import { ListRow } from './list-row';
import { SelectPicker, type SelectOption } from './select-picker';
import { selectionTick } from '../platform/haptics';
import { SwitchTrack } from './switch';

interface RowBase {
  readonly title: string;
  readonly titleHighlight?: TextRange | null;
  readonly subtitle?: string;
  readonly icon?: IconName;
  readonly disabled?: boolean;
}

export function SwitchRow({
  value,
  onChange,
  mixed,
  ...row
}: RowBase & {
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly mixed?: boolean;
}): ReactNode {
  return (
    <ListRow
      {...row}
      label={row.title}
      role="switch"
      checked={value}
      onPress={() => {
        selectionTick();
        onChange(!value);
      }}
      trailing={<SwitchTrack value={value} mixed={mixed ?? false} />}
    />
  );
}

export function NavRow({
  href,
  onPress,
  value,
  selected,
  ...row
}: RowBase & {
  readonly href?: Href;
  readonly onPress?: () => void;
  readonly value?: string;
  readonly selected?: boolean;
}): ReactNode {
  return (
    <ListRow
      {...row}
      {...(href === undefined ? {} : { href })}
      {...(onPress === undefined ? {} : { onPress })}
      {...(value === undefined ? {} : { value })}
      {...(selected === undefined ? {} : { selected })}
      chevron
    />
  );
}

export function ValueRow({ value, ...row }: RowBase & { readonly value: string }): ReactNode {
  return <ListRow {...row} value={value} />;
}

export function ActionRow({
  onPress,
  destructive = false,
  ...row
}: RowBase & { readonly onPress: () => void; readonly destructive?: boolean }): ReactNode {
  return <ListRow {...row} onPress={onPress} destructive={destructive} />;
}

export function SelectRow<T extends string>({
  options,
  value,
  onChange,
  searchable,
  placeholder = 'Not set',
  ...row
}: RowBase & {
  readonly options: readonly SelectOption<T>[];
  readonly value: T | null;
  readonly onChange: (value: T) => void;
  readonly searchable?: boolean;
  readonly placeholder?: string;
}): ReactNode {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const chosen = options.find((option) => option.value === value);
  return (
    <View ref={ref} collapsable={false}>
      <ListRow
        {...row}
        value={chosen?.label ?? placeholder}
        chevron
        onPress={() => {
          measureAnchor(ref, setAnchor);
        }}
      />
      <SelectPicker
        label={row.title}
        options={options}
        value={value}
        anchor={anchor}
        searchable={searchable ?? false}
        onPick={onChange}
        onClose={() => {
          setAnchor(null);
        }}
      />
    </View>
  );
}
