import type { PlannerCollectionRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { FilterChip } from '../../../components/filter-chip';
import { HScroller } from '../../../components/h-scroller';
import { Icon } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { usePlannerCollections, usePlannerPreferences } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { LIST_DOT } from '../item/composer-tokens';
import { habitEntriesOf } from './habits';
import {
  ALL_OPEN,
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
  readonly mode: 'tasks' | 'habits';
  readonly trailing?: ReactNode;
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

const SKELETON_CHIPS = ['a', 'b', 'c', 'd', 'e'] as const;

function ChipSkeletons({ pointer }: { readonly pointer: boolean }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel="Loading smart lists"
      className="flex-row items-center gap-2"
    >
      {SKELETON_CHIPS.map((key) => (
        <View key={key} className={cn('justify-center px-2', pointer ? 'h-9' : 'h-11')}>
          <Skeleton shape="text" className="w-20" />
        </View>
      ))}
    </View>
  );
}

function SmartChipsError({ onRetry }: { readonly onRetry: () => void }): ReactNode {
  return (
    <View className="flex-row items-center gap-2 pl-1">
      <Icon name="alert" size={16} tone="critical" />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        Couldn’t load smart lists
      </Text>
      <Button label="Retry" icon="refresh" variant="text" onPress={onRetry} />
    </View>
  );
}

function SmartChips({ entries, today, filter, onFilter }: SmartListChipsProps): ReactNode {
  const { person } = usePlannerFrame();
  const pointer = useIdiom() === 'pointer';
  const preferences = usePlannerPreferences(person);
  if (preferences.isPending) return <ChipSkeletons pointer={pointer} />;
  if (preferences.isError) {
    return (
      <SmartChipsError
        onRetry={() => {
          background(preferences.refetch(), 'planner.smart_lists_retry_failed');
        }}
      />
    );
  }
  return smartChipsOf(preferences.data.tasks.smart_lists).map((chip) => (
    <SmartChoiceChip
      key={chip.list}
      chip={chip}
      count={smartCountOf(entries, chip.list, today)}
      filter={filter}
      onFilter={onFilter}
    />
  ));
}

function AllHabitsChip({ entries, today, filter, onFilter }: SmartListChipsProps): ReactNode {
  return (
    <FilterChip
      label="Habits"
      value="All habits"
      icon="flame"
      count={habitEntriesOf(entries, ALL_OPEN, today).length}
      active={filter.kind === 'smart'}
      singleChoice
      onPress={() => {
        onFilter(ALL_OPEN);
      }}
    />
  );
}

function countIn(props: SmartListChipsProps, list: PlannerCollectionRow): number {
  if (props.mode === 'tasks') return listCountOf(props.entries, list.id);
  return habitEntriesOf(props.entries, { kind: 'list', id: list.id }, props.today).length;
}

export function SmartListChips(props: SmartListChipsProps): ReactNode {
  const { filter, onFilter, mode, trailing } = props;
  const { person } = usePlannerFrame();
  const lists = userListsOf(usePlannerCollections(person));
  return (
    <HScroller label="Smart lists, scrolls sideways" fade>
      <View className="flex-row items-center gap-2">
        {mode === 'tasks' ? <SmartChips {...props} /> : <AllHabitsChip {...props} />}
        {lists.length > 0 ? <View className="mx-1 h-5 w-px bg-outline-variant" /> : null}
        {lists.map((list) => (
          <UserListChip
            key={list.id}
            list={list}
            count={countIn(props, list)}
            filter={filter}
            onFilter={onFilter}
          />
        ))}
        {trailing === undefined ? null : (
          <>
            <View className="mx-1 h-5 w-px bg-outline-variant" />
            {trailing}
          </>
        )}
      </View>
    </HScroller>
  );
}
