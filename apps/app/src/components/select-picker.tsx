import type { ReactNode } from 'react';
import { useDeferredValue, useState } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { selectionTick } from '../platform/haptics';
import type { Rect } from './anchor';
import { BottomSheet } from './bottom-sheet';
import { Icon } from './icon';
import { Interactive } from './interactive';
import { Popover } from './popover';
import { SearchField } from './search-field';
import { Text } from './text';

export interface SelectOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
}

export interface SelectPickerProps<T extends string> {
  readonly label: string;
  readonly options: readonly SelectOption<T>[];
  readonly value: T | null;
  readonly anchor: Rect | null;
  readonly onPick: (value: T) => void;
  readonly onClose: () => void;
  readonly searchable?: boolean;
}

function OptionRow<T extends string>({
  option,
  selected,
  touch,
  onPick,
}: {
  readonly option: SelectOption<T>;
  readonly selected: boolean;
  readonly touch: boolean;
  readonly onPick: (value: T) => void;
}): ReactNode {
  return (
    <Interactive
      role="radio"
      label={option.label}
      selected={selected}
      onPress={() => {
        selectionTick();
        onPick(option.value);
      }}
      className={cn(
        'flex-row items-center gap-3',
        touch ? 'min-h-row-h px-4' : 'mx-1 min-h-9 rounded-sm px-3',
      )}
      layerClassName="rounded-sm"
    >
      <View className="min-w-0 flex-1">
        <Text variant="body" tone={selected ? 'primary' : 'default'} numberOfLines={1}>
          {option.label}
        </Text>
        {option.description === undefined ? null : (
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {option.description}
          </Text>
        )}
      </View>
      {selected ? <Icon name="check" size={touch ? 24 : 16} tone="primary" /> : null}
    </Interactive>
  );
}

function matching<T extends string>(
  options: readonly SelectOption<T>[],
  query: string,
): readonly SelectOption<T>[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return options;
  }
  return options.filter((option) =>
    `${option.label} ${option.description ?? ''}`.toLowerCase().includes(needle),
  );
}

function Options<T extends string>({
  label,
  options,
  value,
  searchable,
  touch,
  pick,
}: {
  readonly label: string;
  readonly options: readonly SelectOption<T>[];
  readonly value: T | null;
  readonly searchable: boolean;
  readonly touch: boolean;
  readonly pick: (value: T) => void;
}): ReactNode {
  const [query, setQuery] = useState('');
  const shown = matching(options, useDeferredValue(query));
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className={touch ? '-mx-4' : ''}
    >
      {searchable ? (
        <View className={touch ? 'px-4 pb-2' : 'p-2'}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={`Search ${label.toLowerCase()}`}
            focusOnMount={!touch}
          />
        </View>
      ) : null}
      {shown.map((option) => (
        <OptionRow
          key={option.value}
          option={option}
          selected={option.value === value}
          touch={touch}
          onPick={pick}
        />
      ))}
    </View>
  );
}

export function SelectPicker<T extends string>({
  label,
  options,
  value,
  anchor,
  onPick,
  onClose,
  searchable = false,
}: SelectPickerProps<T>): ReactNode {
  const touch = useIdiom() === 'touch';
  const pick = (picked: T): void => {
    onClose();
    onPick(picked);
  };
  const body = (
    <Options
      label={label}
      options={options}
      value={value}
      searchable={searchable}
      touch={touch}
      pick={pick}
    />
  );
  if (touch) {
    return (
      <BottomSheet
        open={anchor !== null}
        onClose={onClose}
        title={label}
        label={label}
        detents={searchable ? ['full'] : ['fit']}
      >
        {body}
      </BottomSheet>
    );
  }
  return (
    <Popover
      open={anchor !== null}
      onClose={onClose}
      anchor={anchor}
      label={label}
      width={Math.max(240, anchor?.width ?? 0)}
    >
      {body}
    </Popover>
  );
}
