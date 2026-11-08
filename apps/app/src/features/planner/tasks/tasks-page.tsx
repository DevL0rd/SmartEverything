import { useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { useIdiom } from '../../../design/platform';
import { useAreaWidth } from '../../../design/size-class';
import { dayKeyOf } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { usePlannerDay, usePlannerItems, usePlannerOccurrences } from '../data';
import { usePlannerShownPerson } from '../frame/person';
import { PlannerFrame } from '../frame/planner-frame';
import { frameLayoutOf } from '../frame/sections';
import { BoardGroupChip, TaskBoard } from './board';
import { TaskHabits } from './habit-row';
import { habitEntriesOf } from './habits';
import { TaskMatrix } from './matrix';
import type { BoardGrouping } from './matrix-model';
import { SmartListChips } from './smart-list-chips';
import {
  ALL_OPEN,
  smartCountOf,
  taskEntriesOf,
  type TaskEntry,
  type TaskFilter,
} from './task-grouping';
import { TaskList } from './task-list';
import { TasksMetrics } from './tasks-metrics';
import { TaskTimeline } from './timeline';

export type TaskView = 'list' | 'board' | 'matrix' | 'timeline' | 'habits';

const VIEW_OPTIONS: readonly SegmentedOption<TaskView>[] = [
  { value: 'list', label: 'List', icon: 'list' },
  { value: 'board', label: 'Board', icon: 'plan' },
  { value: 'matrix', label: 'Matrix', icon: 'grid' },
  { value: 'timeline', label: 'Timeline', icon: 'calendar' },
  { value: 'habits', label: 'Habits', icon: 'flame' },
];

const PHONE_VIEW_OPTIONS: readonly SegmentedOption<TaskView>[] = VIEW_OPTIONS.map(
  ({ value, label }) => ({ value, label }),
);

const VIRTUAL_VIEWS: ReadonlySet<TaskView> = new Set(['list', 'timeline']);

interface PageState {
  readonly view: TaskView;
  readonly filter: TaskFilter;
  readonly grouping: BoardGrouping;
  readonly entries: readonly TaskEntry[];
  readonly today: string;
}

function useShownEntries(): { readonly entries: readonly TaskEntry[]; readonly today: string } {
  const person = usePlannerShownPerson();
  const today = useMinuteOf(dayKeyOf);
  const items = usePlannerItems(person);
  const occurrences = usePlannerOccurrences(person);
  const day = usePlannerDay(person, today).data;
  return { entries: taskEntriesOf({ items, occurrences, day }), today };
}

const VIEW_WORDS: Readonly<Record<Exclude<TaskView, 'habits' | 'board'>, string | null>> = {
  list: null,
  matrix: 'by due date and priority',
  timeline: 'timeline by due date',
};

export function tasksSubtitleOf({ view, grouping, entries, today, filter }: PageState): string {
  if (view === 'habits') {
    const count = habitEntriesOf(entries, filter, today).length;
    return `${String(count)} ${count === 1 ? 'habit' : 'habits'} · newest week on the right`;
  }
  const open = `${String(smartCountOf(entries, 'all', today))} open`;
  if (view === 'board') return `${open} · board ${grouping === 'list' ? 'by list' : 'by status'}`;
  const words = VIEW_WORDS[view];
  return words === null ? open : `${open} · ${words}`;
}

interface ViewBarProps {
  readonly view: TaskView;
  readonly onView: (view: TaskView) => void;
  readonly compact: boolean;
  readonly board: ReactNode;
}

function ViewBar({ view, onView, compact, board }: ViewBarProps): ReactNode {
  const segmented = (
    <Segmented
      options={compact ? PHONE_VIEW_OPTIONS : VIEW_OPTIONS}
      value={view}
      onChange={onView}
      label="View"
      compact={compact}
      fill={compact}
    />
  );
  if (compact) {
    return (
      <View className="gap-3">
        {segmented}
        {view === 'board' ? <View className="flex-row">{board}</View> : null}
      </View>
    );
  }
  return (
    <View className="min-w-0 flex-row flex-wrap items-center gap-2">
      {segmented}
      {view === 'board' ? board : null}
    </View>
  );
}

interface ControlsProps {
  readonly state: PageState;
  readonly onFilter: (filter: TaskFilter) => void;
  readonly viewBar: ReactNode;
}

function Controls({ state, onFilter, viewBar }: ControlsProps): ReactElement {
  const { entries, today, filter } = state;
  return (
    <View className="gap-3 pb-1">
      {viewBar}
      <SmartListChips entries={entries} today={today} filter={filter} onFilter={onFilter} />
      <TasksMetrics entries={entries} today={today} />
    </View>
  );
}

function ViewBody({
  state,
  controls,
}: {
  readonly state: PageState;
  readonly controls: ReactElement;
}): ReactNode {
  const { view, entries, today, filter, grouping } = state;
  if (view === 'list') {
    return (
      <TaskList
        entries={entries}
        today={today}
        filter={filter}
        header={<View className="px-gutter">{controls}</View>}
      />
    );
  }
  if (view === 'timeline') {
    return <TaskTimeline entries={entries} today={today} filter={filter} header={controls} />;
  }
  return (
    <>
      {controls}
      {view === 'board' ? (
        <TaskBoard entries={entries} today={today} filter={filter} grouping={grouping} />
      ) : null}
      {view === 'matrix' ? <TaskMatrix entries={entries} today={today} filter={filter} /> : null}
      {view === 'habits' ? <TaskHabits entries={entries} today={today} filter={filter} /> : null}
    </>
  );
}

export function TasksPage(): ReactNode {
  const [view, setView] = useState<TaskView>('list');
  const [filter, setFilter] = useState<TaskFilter>(ALL_OPEN);
  const [grouping, setGrouping] = useState<BoardGrouping>('list');
  const compact = frameLayoutOf(useAreaWidth()) === 'compact';
  const pointer = useIdiom() === 'pointer';
  const state: PageState = { view, filter, grouping, ...useShownEntries() };
  const board = <BoardGroupChip grouping={grouping} onGrouping={setGrouping} />;
  const viewBar = <ViewBar view={view} onView={setView} compact={compact} board={board} />;
  const controls = (
    <Controls state={state} onFilter={setFilter} viewBar={pointer ? null : viewBar} />
  );
  return (
    <PlannerFrame
      section="tasks"
      subtitle={tasksSubtitleOf(state)}
      scroll={!VIRTUAL_VIEWS.has(view)}
      {...(pointer ? { toolbar: viewBar } : {})}
    >
      <ViewBody state={state} controls={controls} />
    </PlannerFrame>
  );
}
