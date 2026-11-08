import type { PlannerCollectionRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { FilterChip } from '../../../components/filter-chip';
import { HScroller } from '../../../components/h-scroller';
import { useAreaWidth } from '../../../design/size-class';
import { usePlannerCollections, usePlannerPreferences } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { LIST_DOT } from '../item/composer-tokens';
import { frameLayoutOf } from '../frame/sections';
import {
  listCountOf,
  smartChipsOf,
  smartCountOf,
  userListsOf,
  type SmartChip,
  type TaskEntry,
  type TaskFilter,
} from './task-grouping';

export interface SmartListChipsProps {
  readonly entries: readonly TaskEntry[];
  readonly today: string;
  readonly filter: TaskFilter;
  readonly onFilter: (filter: TaskFilter) => void;
}

function SmartChoiceChip({
  chip,
  count,
  filter,
  onFilter,
}: {
  readonly chip: SmartChip;
  readonly count: number;
  readonly filter: TaskFilter;
  readonly onFilter: (filter: TaskFilter) => void;
}): ReactNode {
  return (
    <FilterChip
      label="Smart list"
      value={chip.label}
      icon={chip.icon}
      count={count}
      active={filter.kind === 'smart' && filter.list === chip.list}
      singleChoice
      onPress={() => {
        onFilter({ kind: 'smart', list: chip.list });
      }}
    />
  );
}

function UserListChip({
  list,
  count,
  filter,
  onFilter,
}: {
  readonly list: PlannerCollectionRow;
  readonly count: number;
  readonly filter: TaskFilter;
  readonly onFilter: (filter: TaskFilter) => void;
}): ReactNode {
  return (
    <FilterChip
      label="List"
      value={list.name}
      swatchClassName={LIST_DOT[list.colour]}
      count={count}
      active={filter.kind === 'list' && filter.id === list.id}
      singleChoice
      onPress={() => {
        onFilter({ kind: 'list', id: list.id });
      }}
    />
  );
}

function Chips({ entries, today, filter, onFilter }: SmartListChipsProps): ReactNode {
  const { person } = usePlannerFrame();
  const shown = usePlannerPreferences(person).data?.tasks.smart_lists ?? [];
  const lists = userListsOf(usePlannerCollections(person));
  return (
    <>
      {smartChipsOf(shown).map((chip) => (
        <SmartChoiceChip
          key={chip.list}
          chip={chip}
          count={smartCountOf(entries, chip.list, today)}
          filter={filter}
          onFilter={onFilter}
        />
      ))}
      {lists.length === 0 ? null : <View className="mx-1 h-5 w-px bg-outline-variant" />}
      {lists.map((list) => (
        <UserListChip
          key={list.id}
          list={list}
          count={listCountOf(entries, list.id)}
          filter={filter}
          onFilter={onFilter}
        />
      ))}
    </>
  );
}

export function SmartListChips(props: SmartListChipsProps): ReactNode {
  const compact = frameLayoutOf(useAreaWidth()) === 'compact';
  if (compact) {
    return (
      <HScroller label="Smart lists, scrolls sideways" fade fadeSurface="bg" arrows={false}>
        <View className="flex-row items-center gap-2">
          <Chips {...props} />
        </View>
      </HScroller>
    );
  }
  return (
    <View accessibilityLabel="Smart lists" className="flex-row flex-wrap items-center gap-2">
      <Chips {...props} />
    </View>
  );
}
