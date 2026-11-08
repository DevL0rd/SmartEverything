import type { AiChatRow, AiHarnessSession, ChatTimelineTool } from '@smarteverything/domain';
import { GOAL_PHASE_LABEL, latestGoal, shownGoal, type GoalView } from '../goal/goal-model';
import {
  backgroundCommands,
  jobsSummary,
  runningJobs,
  type BackgroundCommand,
} from '../jobs/jobs-model';
import { currentTodo, latestTodos, type TodoItem, type TodoList } from '../todo/todo-model';

export interface BottomStatusInput {
  readonly chat: Pick<AiChatRow, 'id' | 'engine'>;
  readonly tools: readonly ChatTimelineTool[];
  readonly session: Pick<AiHarnessSession, 'work'> | undefined;
  readonly todos?: TodoList | null;
}

export const BOTTOM_AREA_ID = 'chat-bottom-area';

export const BOTTOM_READING_ID = {
  context: 'chat-context-reading',
  billing: 'chat-billing-reading',
} as const;
export type BottomReading = keyof typeof BOTTOM_READING_ID;

export const BOTTOM_PANELS = ['goal', 'tasks', 'jobs'] as const;
export type BottomPanel = (typeof BOTTOM_PANELS)[number];

export const BOTTOM_GRID = { minItemWidth: 272, gap: 'tight', maxColumns: 5 } as const;
export const COMPACT_BOTTOM_GRID_MIN_WIDTH = 144;

export interface Indicator {
  readonly panel: BottomPanel;
  readonly label: string;
  readonly text: string;
  readonly alert: boolean;
}

export interface BottomActivity {
  readonly goal: GoalView | null;
  readonly todos: readonly TodoItem[];
  readonly done: number;
  readonly current: TodoItem | null;
  readonly running: number;
  readonly helpers: number;
  readonly work: readonly BackgroundCommand[];
  readonly indicators: readonly Indicator[];
}

const NO_ACTIVITY: BottomActivity = {
  goal: null,
  todos: [],
  done: 0,
  current: null,
  running: 0,
  helpers: 0,
  work: [],
  indicators: [],
};

function goalIndicator(goal: GoalView | null): Indicator | null {
  if (goal === null) return null;
  return {
    panel: 'goal',
    label: `Goal, ${GOAL_PHASE_LABEL[goal.phase]}, ${String(goal.roundsStarted)} of ${String(goal.maxGoalRounds)} rounds`,
    text: `${String(goal.roundsStarted)}/${String(goal.maxGoalRounds)}`,
    alert: goal.phase === 'blocked',
  };
}

function tasksIndicator(list: TodoList | null): Indicator | null {
  if (list === null || list.items.length === 0) return null;
  return {
    panel: 'tasks',
    label: `Tasks, ${String(list.done)} of ${String(list.items.length)} done`,
    text: `${String(list.done)}/${String(list.items.length)}`,
    alert: false,
  };
}

function jobsIndicator(running: number): Indicator | null {
  if (running === 0) return null;
  return {
    panel: 'jobs',
    label: `Background jobs, ${jobsSummary(running)}`,
    text: String(running),
    alert: false,
  };
}

export function bottomActivityOf({
  chat,
  tools,
  session,
  todos = null,
}: BottomStatusInput): BottomActivity {
  if (chat.engine.kind !== 'dsh') return NO_ACTIVITY;
  const goal = shownGoal(latestGoal(tools));
  const list = todos ?? latestTodos(tools);
  const { total: running, helpers } = runningJobs(session);
  return {
    goal,
    todos: list?.items ?? [],
    done: list?.done ?? 0,
    current: list === null ? null : currentTodo(list),
    running,
    helpers,
    work: backgroundCommands(tools),
    indicators: [goalIndicator(goal), tasksIndicator(list), jobsIndicator(running)].filter(
      (indicator) => indicator !== null,
    ),
  };
}

export type BottomOpen = Readonly<Record<BottomPanel, boolean>>;

export const BOTTOM_COLLAPSED: BottomOpen = { goal: false, tasks: false, jobs: false };

export interface BottomVisibility {
  readonly expanded: boolean;
  readonly open: BottomOpen;
}

export const INITIAL_BOTTOM_VISIBILITY: BottomVisibility = {
  expanded: false,
  open: BOTTOM_COLLAPSED,
};

export function toggledBottomArea(
  state: BottomVisibility,
  compactHeight: boolean,
): BottomVisibility {
  if (state.expanded) return { ...state, expanded: false };
  return {
    expanded: true,
    open: compactHeight ? BOTTOM_COLLAPSED : { goal: true, tasks: true, jobs: true },
  };
}

function rowPanels(panel: BottomPanel, columns: number): readonly BottomPanel[] {
  const rowStart = Math.floor(BOTTOM_PANELS.indexOf(panel) / columns) * columns;
  return BOTTOM_PANELS.slice(rowStart, rowStart + columns);
}

export function groupedBottomVisibility(
  state: BottomVisibility,
  columns: number,
  singleRow = false,
): BottomVisibility {
  const firstOpen = singleRow ? BOTTOM_PANELS.find((panel) => state.open[panel]) : undefined;
  if (firstOpen !== undefined) {
    return {
      ...activatedPanel(INITIAL_BOTTOM_VISIBILITY, firstOpen, columns),
      expanded: state.expanded,
    };
  }
  const open = { ...state.open };
  for (const panel of BOTTOM_PANELS) {
    open[panel] = rowPanels(panel, columns).some((member) => state.open[member]);
  }
  return { ...state, open };
}

export function activatedPanel(
  state: BottomVisibility,
  panel: BottomPanel,
  columns = 1,
  singleRow = false,
): BottomVisibility {
  const row = rowPanels(panel, columns);
  const open = { ...(singleRow ? BOTTOM_COLLAPSED : state.open) };
  const expanded = !state.expanded || !row.some((member) => state.open[member]);
  for (const member of row) {
    open[member] = expanded;
  }
  return { expanded: true, open };
}

export function openedBottomReadings(
  state: BottomVisibility,
  keyboardVisible: boolean,
): BottomVisibility {
  return state.expanded && !keyboardVisible ? state : { expanded: true, open: BOTTOM_COLLAPSED };
}
