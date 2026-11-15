import type { PlannerCollectionRow } from '@smarteverything/domain';
import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { measureAnchor, type Rect } from '../../../components/anchor';
import { BottomSheet } from '../../../components/bottom-sheet';
import { Button } from '../../../components/button';
import { ChoiceChip } from '../../../components/choice-chip';
import {
  COMPACT_ROW_FRAME,
  COMPACT_ROW_HEIGHT,
  COMPACT_ROW_ICON_SIZE,
} from '../../../components/compact-panel';
import { FilterChip } from '../../../components/filter-chip';
import { HScroller } from '../../../components/h-scroller';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Popover } from '../../../components/popover';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { selectionTick } from '../../../platform/haptics';
import type { PlannerSearchFilter, PlannerSearchWhen } from '../data/search';
import { LIST_DOT } from '../item/composer-tokens';
import {
  KIND_CHOICES,
  WHEN_TEXT,
  calendarChipTextOf,
  choiceOfKinds,
  filtered,
  isCollectionChosen,
  kindsOfChoice,
  toggledCollection,
  type KindChoice,
} from './search-model';

const KIND_TEXT: Readonly<Record<KindChoice, string>> = {
  all: 'Events and tasks',
  event: 'Events',
  task: 'Tasks',
};

const WHEN_CHOICES: readonly PlannerSearchWhen[] = ['all', 'upcoming', 'past'];

const PICKER_LABEL = 'Calendars and lists';
const PICKER_DETENTS = ['fit'] as const;
const PICKER_WIDTH = 280;

export interface SearchFiltersProps {
  readonly filter: PlannerSearchFilter;
  readonly collections: readonly PlannerCollectionRow[];
  readonly onChange: (filter: PlannerSearchFilter) => void;
  readonly clearable: boolean;
}

interface PickerProps {
  readonly filter: PlannerSearchFilter;
  readonly collections: readonly PlannerCollectionRow[];
  readonly onChange: (filter: PlannerSearchFilter) => void;
}

function CollectionRow({
  collection,
  checked,
  touch,
  onToggle,
}: {
  readonly collection: PlannerCollectionRow;
  readonly checked: boolean;
  readonly touch: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <Interactive
      role="checkbox"
      label={collection.name}
      checked={checked}
      onPress={() => {
        selectionTick();
        onToggle();
      }}
      className={cn(
        COMPACT_ROW_FRAME,
        touch ? cn(COMPACT_ROW_HEIGHT, 'rounded-sm py-1') : 'mx-1 min-h-9 rounded-sm px-3',
      )}
      layerClassName="rounded-sm"
    >
      <View className={cn('size-3 rounded-full', LIST_DOT[collection.colour])} />
      <Text variant="body" className="min-w-0 flex-1" numberOfLines={1}>
        {collection.name}
      </Text>
      {checked ? (
        <Icon name="check" size={touch ? COMPACT_ROW_ICON_SIZE : 16} tone="primary" />
      ) : null}
    </Interactive>
  );
}

function Group({
  title,
  rows,
  touch,
  filter,
  all,
  onChange,
}: {
  readonly title: string;
  readonly rows: readonly PlannerCollectionRow[];
  readonly touch: boolean;
  readonly all: readonly string[];
} & Pick<PickerProps, 'filter' | 'onChange'>): ReactNode {
  if (rows.length === 0) return null;
  return (
    <View accessibilityRole="list" accessibilityLabel={title}>
      <Text
        variant="caption"
        tone="variant"
        className={cn('pb-1 pt-2', touch ? undefined : 'px-4')}
      >
        {title}
      </Text>
      {rows.map((collection) => (
        <CollectionRow
          key={collection.id}
          collection={collection}
          checked={isCollectionChosen(filter.collections, collection.id)}
          touch={touch}
          onToggle={() => {
            onChange({
              ...filter,
              collections: toggledCollection(filter.collections, collection.id, all),
            });
          }}
        />
      ))}
    </View>
  );
}

function PickerBody({
  filter,
  collections,
  onChange,
  touch,
}: PickerProps & { readonly touch: boolean }): ReactNode {
  const all = collections.map((collection) => collection.id);
  const shared = { filter, onChange, touch, all };
  return (
    <View className={cn(!touch && 'py-1')}>
      <Group
        title="Calendars"
        rows={collections.filter((row) => row.kind !== 'list')}
        {...shared}
      />
      <Group
        title="Task lists"
        rows={collections.filter((row) => row.kind === 'list')}
        {...shared}
      />
    </View>
  );
}

function PickerFooter({
  filter,
  onChange,
  onClose,
  fill,
}: Pick<PickerProps, 'filter' | 'onChange'> & {
  readonly onClose: () => void;
  readonly fill: boolean;
}): ReactNode {
  return (
    <View className={cn('flex-row justify-end gap-2', fill && 'flex-1')}>
      <Button
        label="Show all"
        variant="text"
        disabled={filter.collections === null}
        onPress={() => {
          onChange({ ...filter, collections: null });
        }}
      />
      <Button label="Done" onPress={onClose} />
    </View>
  );
}

function CalendarPicker({
  anchor,
  onClose,
  ...props
}: PickerProps & { readonly anchor: Rect | null; readonly onClose: () => void }): ReactNode {
  const touch = useIdiom() === 'touch';
  const footer = (
    <PickerFooter filter={props.filter} onChange={props.onChange} onClose={onClose} fill={touch} />
  );
  if (touch) {
    return (
      <BottomSheet
        open={anchor !== null}
        onClose={onClose}
        title={PICKER_LABEL}
        label={PICKER_LABEL}
        detents={PICKER_DETENTS}
        footer={footer}
        compact
      >
        <PickerBody {...props} touch />
      </BottomSheet>
    );
  }
  return (
    <Popover
      open={anchor !== null}
      onClose={onClose}
      anchor={anchor}
      label={PICKER_LABEL}
      width={Math.max(PICKER_WIDTH, anchor?.width ?? 0)}
    >
      <PickerBody {...props} touch={false} />
      <View className="border-t border-outline-variant px-2 py-2">{footer}</View>
    </Popover>
  );
}

function CalendarChip(props: PickerProps): ReactNode {
  const ref = useRef<View>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  return (
    <>
      <FilterChip
        label="Calendar"
        value={calendarChipTextOf(props.filter.collections, props.collections)}
        icon="calendar"
        affordance="menu"
        active={props.filter.collections !== null}
        expanded={anchor !== null}
        anchorRef={ref}
        onPress={() => {
          measureAnchor(ref, setAnchor);
        }}
      />
      <CalendarPicker
        {...props}
        anchor={anchor}
        onClose={() => {
          setAnchor(null);
        }}
      />
    </>
  );
}

function KindAndWhen({ filter, onChange }: Pick<PickerProps, 'filter' | 'onChange'>): ReactNode {
  return (
    <>
      <ChoiceChip
        label="Kind"
        icon="listCheck"
        options={KIND_CHOICES.map((value) => ({ value, label: KIND_TEXT[value] }))}
        value={choiceOfKinds(filter.kinds)}
        all="all"
        onChange={(choice) => {
          onChange({ ...filter, kinds: kindsOfChoice(choice) });
        }}
      />
      <ChoiceChip
        label="When"
        icon="clock"
        options={WHEN_CHOICES.map((value) => ({ value, label: WHEN_TEXT[value] }))}
        value={filter.when}
        all="all"
        onChange={(when) => {
          onChange({ ...filter, when });
        }}
      />
    </>
  );
}

export function SearchFilters({
  filter,
  collections,
  onChange,
  clearable,
}: SearchFiltersProps): ReactNode {
  return (
    <HScroller label="Search filters" fade>
      <View className="flex-row items-center gap-2">
        <CalendarChip filter={filter} collections={collections} onChange={onChange} />
        <KindAndWhen filter={filter} onChange={onChange} />
        {clearable && filtered(filter) ? (
          <Button
            label="Clear filters"
            variant="text"
            onPress={() => {
              onChange({ ...filter, collections: null, kinds: null, when: 'all' });
            }}
          />
        ) : null}
      </View>
    </HScroller>
  );
}
