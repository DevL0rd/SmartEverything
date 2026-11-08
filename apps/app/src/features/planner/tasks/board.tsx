import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { FilterChip } from '../../../components/filter-chip';
import { HScroller } from '../../../components/h-scroller';
import type { IconName } from '../../../components/icon';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { useIdiom } from '../../../design/platform';
import { useAreaWidth } from '../../../design/size-class';
import { useThemeSetting } from '../../../design/theme';
import { SEMANTIC_SIZES } from '../../../design/tokens';
import { usePlannerCollections } from '../data';
import { usePlannerFrame } from '../frame/frame-context';
import { frameLayoutOf } from '../frame/sections';
import { BoardColumn } from './board-column';
import { BOARD_GROUPING_LABEL, boardColumnsOf, type BoardGrouping } from './matrix-model';
import type { TaskEntry, TaskFilter } from './task-grouping';

const GROUPINGS: readonly BoardGrouping[] = ['list', 'status'];

const GROUPING_ICON: Readonly<Record<BoardGrouping, IconName>> = {
  list: 'listCheck',
  status: 'clock',
};

export function BoardGroupChip({
  grouping,
  onGrouping,
}: {
  readonly grouping: BoardGrouping;
  readonly onGrouping: (grouping: BoardGrouping) => void;
}): ReactNode {
  const items: readonly MenuItem[] = GROUPINGS.map((choice) => ({
    id: choice,
    label: BOARD_GROUPING_LABEL[choice],
    icon: choice === grouping ? 'check' : GROUPING_ICON[choice],
    onPress: (): void => {
      onGrouping(choice);
    },
  }));
  const { ref, open, menu } = useAnchoredMenu(items, 'Board columns');
  return (
    <>
      <FilterChip
        label="Board columns"
        value={BOARD_GROUPING_LABEL[grouping]}
        icon="filter"
        active={false}
        affordance="menu"
        anchorRef={ref}
        onPress={open}
      />
      {menu}
    </>
  );
}

const PHONE_COLUMN = 300;
const PHONE_PEEK = 40;
const WIDE_COLUMN = 248;

interface ColumnFit {
  readonly available: number;
  readonly count: number;
  readonly gap: number;
  readonly compact: boolean;
}

function columnWidthOf({ available, count, gap, compact }: ColumnFit): number {
  if (compact) return Math.min(PHONE_COLUMN, available - PHONE_PEEK);
  const fitted = (available - gap * Math.max(0, count - 1)) / Math.max(1, count);
  return Math.max(WIDE_COLUMN, Math.floor(fitted));
}

function useGridGap(): number {
  const idiom = useIdiom();
  const density = useThemeSetting('density');
  return SEMANTIC_SIZES[idiom][density].gridGap;
}

export interface TaskBoardProps {
  readonly entries: readonly TaskEntry[];
  readonly today: string;
  readonly filter: TaskFilter;
  readonly grouping: BoardGrouping;
}

export function TaskBoard({ entries, today, filter, grouping }: TaskBoardProps): ReactNode {
  const { person } = usePlannerFrame();
  const collections = usePlannerCollections(person);
  const compact = frameLayoutOf(useAreaWidth()) === 'compact';
  const [available, setAvailable] = useState(0);
  const columns = boardColumnsOf({ entries, filter, collections, today, grouping });
  const gap = useGridGap();
  const width = columnWidthOf({ available, count: columns.length, gap, compact });
  return (
    <View
      {...(compact ? { className: '-mr-gutter' } : {})}
      onLayout={(event: LayoutChangeEvent) => {
        setAvailable(event.nativeEvent.layout.width);
      }}
    >
      {available === 0 ? null : (
        <HScroller
          label={grouping === 'list' ? 'Board by list' : 'Board by status'}
          {...(compact ? { snapTo: width + gap } : {})}
          fade
          fadeSurface="bg"
        >
          {columns.map((column) => (
            <View key={column.key} className="self-start">
              <BoardColumn column={column} today={today} width={width} />
            </View>
          ))}
          {compact ? <View className="w-gutter" /> : null}
        </HScroller>
      )}
    </View>
  );
}
