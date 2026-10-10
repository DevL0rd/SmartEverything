import type { ReactNode } from 'react';
import type { WatchGoal } from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import type { IconName } from '../../components/icon';
import { ListRow } from '../../components/list-row';

const GOALS: Readonly<
  Record<
    WatchGoal['key'],
    { readonly title: string; readonly unit: string; readonly icon: IconName }
  >
> = {
  steps: { title: 'Steps', unit: 'steps', icon: 'footprints' },
  move_kcal: { title: 'Move', unit: 'kcal', icon: 'flame' },
  active_minutes: { title: 'Active minutes', unit: 'min', icon: 'timer' },
  standing_hours: { title: 'Standing', unit: 'h', icon: 'personStanding' },
};

function amount(goal: WatchGoal, value: number): string {
  return `${value.toLocaleString()} ${GOALS[goal.key].unit}`;
}

function noteOf(goal: WatchGoal): string | null {
  if (goal.reported !== null && goal.sent !== null && goal.reported !== goal.sent) {
    return `The watch changed this to ${amount(goal, goal.reported)}`;
  }
  if (goal.sent === null) {
    return 'Set on the watch, not from your profile';
  }
  if (goal.shown === false) {
    return 'Not shown on the watch';
  }
  return null;
}

function GoalRow({ goal }: { readonly goal: WatchGoal }): ReactNode {
  const value = goal.sent ?? goal.reported;
  const note = noteOf(goal);
  return (
    <ListRow
      title={GOALS[goal.key].title}
      icon={GOALS[goal.key].icon}
      {...(value === null ? {} : { value: amount(goal, value) })}
      {...(note === null ? {} : { subtitle: note })}
    />
  );
}

export function WatchGoalRows({ goals }: { readonly goals: readonly WatchGoal[] }): ReactNode {
  return (
    <>
      {goals.map((goal) => (
        <GoalRow key={goal.key} goal={goal} />
      ))}
      <ListRow
        title="Daily goals"
        subtitle="Goals come from your profile"
        icon="trophy"
        chevron
        href={href.settings.page('health/goals')}
      />
    </>
  );
}
