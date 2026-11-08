import type { ReactNode, RefObject } from 'react';
import { useDeferredValue, useState } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { selectionTick } from '../platform/haptics';
import type { Rect } from './anchor';
import { BottomSheet } from './bottom-sheet';
import {
  COMPACT_DETAIL_ROW_HEIGHT,
  COMPACT_ROW_FRAME,
  COMPACT_ROW_HEIGHT,
  COMPACT_ROW_ICON_SIZE,
} from './compact-panel';
import { focusView } from './focus-request';
import { Icon } from './icon';
import { Interactive } from './interactive';
import { Popover } from './popover';
import { SearchField } from './search-field';
import { useSheetSubpage } from './sheet-navigation';
import { Text } from './text';

const SELECT_DETENTS = ['fit'] as const;

export interface SelectOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
  readonly wrapDescription?: boolean;
  readonly disabled?: boolean;
}

export interface SelectPickerProps<T extends string> {
  readonly label: string;
  readonly options: readonly SelectOption<T>[];
  readonly value: T | null;
  readonly anchor: Rect | null;
  readonly onPick: (value: T) => void;
  readonly onClose: () => void;
  readonly searchable?: boolean;
  readonly opener?: RefObject<View | null>;
}

interface OptionRowProps<T extends string> {
  readonly option: SelectOption<T>;
  readonly selected: boolean;
  readonly touch: boolean;
  readonly onPick: (value: T) => void;
}

function OptionRow<T extends string>({
  option,
  selected,
  touch,
  onPick,
}: OptionRowProps<T>): ReactNode {
  const rowHeight =
    option.description === undefined ? COMPACT_ROW_HEIGHT : COMPACT_DETAIL_ROW_HEIGHT;
  return (
    <Interactive
      role="radio"
      disabled={option.disabled === true}
      label={option.label}
      checked={selected}
      onPress={() => {
        selectionTick();
        onPick(option.value);
      }}
      className={cn(
        COMPACT_ROW_FRAME,
        touch ? cn(rowHeight, 'rounded-sm py-1') : 'mx-1 min-h-9 rounded-sm px-3',
      )}
      layerClassName="rounded-sm"
    >
      <View className="min-w-0 flex-1">
        <Text
          variant="body"
          tone={selected ? 'primary' : 'default'}
          {...(touch ? {} : { numberOfLines: 1 })}
        >
          {option.label}
        </Text>
        {option.description === undefined ? null : (
          <Text
            variant="footnote"
            tone="variant"
            {...(touch || option.wrapDescription === true ? {} : { numberOfLines: 1 })}
          >
            {option.description}
          </Text>
        )}
      </View>
      {selected ? (
        <Icon name="check" size={touch ? COMPACT_ROW_ICON_SIZE : 16} tone="primary" />
      ) : null}
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
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>
      {searchable ? (
        <View className={touch ? 'pb-2' : 'p-2'}>
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
  opener,
}: SelectPickerProps<T>): ReactNode {
  const touch = useIdiom() === 'touch';
  const close = (): void => {
    onClose();
    if (!(subpage && touch) && opener !== undefined) {
      requestAnimationFrame(() => {
        focusView(opener.current);
      });
    }
  };
  const pick = (picked: T): void => {
    close();
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
  const subpage = useSheetSubpage(touch && anchor !== null, {
    title: label,
    onClose,
    detents: SELECT_DETENTS,
    opener,
    children: body,
  });
  if (subpage && touch) return null;
  return (
    <SelectSurface touch={touch} anchor={anchor} label={label} onClose={close}>
      {body}
    </SelectSurface>
  );
}

function SelectSurface({
  touch,
  anchor,
  label,
  onClose,
  children,
}: {
  readonly touch: boolean;
  readonly anchor: Rect | null;
  readonly label: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}): ReactNode {
  if (touch) {
    return (
      <BottomSheet
        open={anchor !== null}
        onClose={onClose}
        title={label}
        label={label}
        detents={SELECT_DETENTS}
        compact
      >
        {children}
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
      {children}
    </Popover>
  );
}
