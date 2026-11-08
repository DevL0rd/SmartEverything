import type { ReactNode } from 'react';
import { ScrollView, View, type LayoutChangeEvent } from 'react-native';
import { ProgressBar } from '../../../components/charts';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import type { ColourRole } from '../../../design/tokens';
import { GOAL_PHASE_LABEL, goalRounds, type GoalView } from '../goal/goal-model';
import { jobsSummary, type BackgroundCommand } from '../jobs/jobs-model';
import type { TodoItem } from '../todo/todo-model';
import { useInitialTodoScroll } from './use-initial-todo-scroll';
import { type BottomActivity, type BottomPanel } from './bottom-status-model';

const GOAL_TONE: Readonly<Record<GoalView['phase'], Tone>> = {
  active: 'primary',
  paused: 'variant',
  blocked: 'warning',
  complete: 'positive',
};

const GOAL_COLOUR: Readonly<Record<GoalView['phase'], ColourRole>> = {
  active: 'primary',
  paused: 'outline',
  blocked: 'warning',
  complete: 'positive',
};

const ICON: Readonly<Record<BottomPanel, IconName>> = {
  goal: 'trophy',
  tasks: 'list',
  jobs: 'terminal',
};

const TITLE: Readonly<Record<BottomPanel, string>> = {
  goal: 'Goal',
  tasks: 'Tasks',
  jobs: 'Background jobs',
};

const EMPTY: Readonly<Record<BottomPanel, string>> = {
  goal: 'No goal set',
  tasks: 'No tasks',
  jobs: 'No jobs running',
};

const TODO_ICON: Readonly<Record<TodoItem['status'], IconName>> = {
  completed: 'circleCheck',
  in_progress: 'loader',
  pending: 'circle',
};

const TODO_TONE: Readonly<Record<TodoItem['status'], Tone>> = {
  completed: 'positive',
  in_progress: 'primary',
  pending: 'variant',
};

const TODO_STATUS_LABEL: Readonly<Record<TodoItem['status'], string>> = {
  completed: 'Completed',
  in_progress: 'In progress',
  pending: 'Pending',
};

function DetailRow({
  title,
  accessibilityLabel,
  subtitle,
  caption,
  icon,
  iconTone,
  onLayout,
}: {
  readonly title: string;
  readonly accessibilityLabel?: string;
  readonly subtitle?: string;
  readonly caption?: string;
  readonly icon?: IconName;
  readonly iconTone?: Tone;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
}): ReactNode {
  return (
    <View className="flex-row items-start gap-2 py-1.5" onLayout={onLayout}>
      {icon === undefined ? null : <Icon name={icon} size={16} tone={iconTone ?? 'variant'} />}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="callout" accessibilityLabel={accessibilityLabel}>
          {title}
        </Text>
        {subtitle === undefined ? null : (
          <Text variant="caption" tone="variant">
            {subtitle}
          </Text>
        )}
        {caption === undefined ? null : (
          <Text variant="caption" tone="variant">
            {caption}
          </Text>
        )}
      </View>
    </View>
  );
}

function goalRows(activity: BottomActivity): readonly ReactNode[] {
  const goal = activity.goal;
  if (goal === null) return [];
  const reason = goal.blockedReason;
  return [
    <DetailRow
      key="objective"
      title="Objective"
      subtitle={goal.objective}
      caption={goalRounds(goal)}
      icon={ICON.goal}
      iconTone={GOAL_TONE[goal.phase]}
    />,
    ...(reason === null
      ? []
      : [<DetailRow key="blocked" title={reason} icon="warning" iconTone="warning" />]),
  ];
}

interface TodoDetailsProps {
  readonly items: readonly TodoItem[];
  readonly bodyHeight: number;
}

function TodoDetails({ items, bodyHeight }: TodoDetailsProps): ReactNode {
  const bounds = { maxHeight: bodyHeight };
  const { target, scroll, onRowLayout, onContentSizeChange } = useInitialTodoScroll(items);
  return (
    <ScrollView
      ref={scroll}
      className="grow-0"
      style={bounds}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      onContentSizeChange={onContentSizeChange}
    >
      {items.map((item, index) => (
        <DetailRow
          key={`${String(index)}:${item.content}`}
          title={item.content}
          accessibilityLabel={`${TODO_STATUS_LABEL[item.status]}, ${item.content}`}
          icon={TODO_ICON[item.status]}
          iconTone={TODO_TONE[item.status]}
          {...(index === target ? { onLayout: onRowLayout } : {})}
        />
      ))}
    </ScrollView>
  );
}

function jobRows(jobs: readonly BackgroundCommand[]): readonly ReactNode[] {
  return jobs.map((job) => (
    <DetailRow
      key={job.key}
      title={job.title}
      {...(job.command === job.title ? {} : { subtitle: job.command })}
      icon={ICON.jobs}
      iconTone={job.started ? 'variant' : 'primary'}
    />
  ));
}

function rowsOf(
  panel: Exclude<BottomPanel, 'tasks'>,
  activity: BottomActivity,
): readonly ReactNode[] {
  switch (panel) {
    case 'goal':
      return goalRows(activity);
    case 'jobs':
      return [
        ...(activity.helpers === 0
          ? []
          : [
              <DetailRow
                key="helpers"
                title="Helper agents"
                subtitle={jobsSummary(activity.helpers)}
              />,
            ]),
        ...jobRows(activity.work),
      ];
  }
}

function taskCaption(activity: BottomActivity): string {
  const step = activity.current;
  return step === null
    ? 'Tasks'
    : `${step.status === 'in_progress' ? 'Now' : 'Next'}: ${step.content}`;
}

function GoalSummary({ goal }: { readonly goal: GoalView }): ReactNode {
  const rounds = goalRounds(goal);
  return (
    <>
      <Icon name="trophy" size={20} tone={GOAL_TONE[goal.phase]} />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="callout" className="font-sans-medium">
          Goal
        </Text>
        <ProgressBar
          progress={Math.min(1, goal.roundsStarted / goal.maxGoalRounds)}
          colour={GOAL_COLOUR[goal.phase]}
          label={rounds}
        />
      </View>
      <View className="items-end">
        <Text variant="label" tone={GOAL_TONE[goal.phase]}>
          {GOAL_PHASE_LABEL[goal.phase]}
        </Text>
        <Text variant="caption" tone="variant">
          {rounds}
        </Text>
      </View>
    </>
  );
}

function TasksSummary({ activity }: { readonly activity: BottomActivity }): ReactNode {
  const { todos, done } = activity;
  const count = todos.length;
  const progress = `${String(done)} of ${String(count)} done`;
  return (
    <>
      <Icon name="list" size={20} tone="primary" />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="callout" className="font-sans-medium">
          Tasks
        </Text>
        {count === 0 ? null : (
          <ProgressBar progress={done / count} colour="positive" label={progress} />
        )}
      </View>
      {count === 0 ? null : (
        <Text variant="caption" tone="variant">
          {progress}
        </Text>
      )}
    </>
  );
}

function SectionSummary({
  panel,
  activity,
}: {
  readonly panel: BottomPanel;
  readonly activity: BottomActivity;
}): ReactNode {
  switch (panel) {
    case 'goal':
      return activity.goal === null ? (
        <>
          <Icon name="trophy" size={20} tone="variant" />
          <Text variant="callout" className="min-w-0 flex-1 font-sans-medium">
            Goal
          </Text>
        </>
      ) : (
        <GoalSummary goal={activity.goal} />
      );
    case 'tasks':
      return <TasksSummary activity={activity} />;
    case 'jobs':
      return (
        <>
          <Icon name="terminal" size={20} tone="primary" />
          <Text variant="callout" className="min-w-0 flex-1 font-sans-medium">
            Background jobs
          </Text>
          {activity.running === 0 ? null : (
            <Text variant="caption" tone="variant">
              {jobsSummary(activity.running)}
            </Text>
          )}
        </>
      );
  }
}

interface SectionProps {
  readonly panel: BottomPanel;
  readonly label: string | undefined;
  readonly open: boolean;
  readonly activity: BottomActivity;
  readonly onPress: (panel: BottomPanel) => void;
  readonly bodyHeight: number;
  readonly compact: boolean;
}

function sectionHint({
  panel,
  label,
  activity,
}: Omit<SectionProps, 'bodyHeight'>): string | undefined {
  if (label === undefined) return undefined;
  const summary =
    panel === 'goal' ? activity.goal?.objective : panel === 'tasks' ? taskCaption(activity) : null;
  return summary !== null && summary !== undefined && summary.length > 0
    ? `${label}. ${summary}`
    : label;
}

function SectionHead({
  panel,
  label,
  open,
  activity,
  onPress,
  compact,
}: Omit<SectionProps, 'bodyHeight'>): ReactNode {
  const hint = sectionHint({ panel, label, open, activity, onPress, compact });
  return (
    <Interactive
      label={`${open ? 'Collapse' : 'Expand'} ${TITLE[panel]}`}
      {...(hint === undefined ? {} : { hint })}
      expanded={open}
      focusInset
      onPress={(): void => {
        onPress(panel);
      }}
      className={
        compact
          ? 'min-h-touch-min flex-row items-center gap-1.5 rounded-md px-2 py-1.5'
          : 'min-h-touch-min flex-row items-center gap-3 rounded-md px-3 py-1.5'
      }
      layerClassName="rounded-md"
    >
      {compact ? (
        <>
          <Icon name={ICON[panel]} size={16} tone="primary" />
          <Text variant="callout" className="min-w-0 flex-1 font-sans-medium">
            {TITLE[panel]}
          </Text>
        </>
      ) : (
        <SectionSummary panel={panel} activity={activity} />
      )}
      <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} tone="variant" />
    </Interactive>
  );
}

function StatusBody({
  panel,
  activity,
  bodyHeight,
}: {
  readonly panel: BottomPanel;
  readonly activity: BottomActivity;
  readonly bodyHeight: number;
}): ReactNode {
  if (panel === 'tasks' && activity.todos.length > 0)
    return <TodoDetails items={activity.todos} bodyHeight={bodyHeight} />;
  const rows = panel === 'tasks' ? [] : rowsOf(panel, activity);
  if (rows.length === 0)
    return (
      <Text variant="caption" tone="variant">
        {EMPTY[panel]}
      </Text>
    );
  const bounds = { maxHeight: bodyHeight };
  return (
    <ScrollView
      className="grow-0"
      style={bounds}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >
      {rows}
    </ScrollView>
  );
}

export function StatusSection(props: SectionProps): ReactNode {
  const { panel, open, activity, bodyHeight } = props;
  return (
    <View className="min-w-0 grow rounded-md border-hairline border-outline-variant bg-surface-1">
      <SectionHead {...props} />
      {open ? (
        <View className="grow px-3 pb-2">
          <StatusBody panel={panel} activity={activity} bodyHeight={bodyHeight} />
        </View>
      ) : null}
    </View>
  );
}
