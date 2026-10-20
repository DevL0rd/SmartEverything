import type { BrushingGoal } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useBrushAct } from '../data/brush-act';
import { hourText } from '../model/brush-model';
import { Anchored } from './anchored';
import { StepperRow } from './rows';
import type { SettingsProps } from './settings-props';

const HOURS = { min: 0, max: 23, step: 1 } as const;
const MINIMUM = { min: 30, max: 300, step: 10 } as const;
const PER_DAY = { min: 1, max: 6, step: 1 } as const;
const WHOLE_ROUTINE_S = 120;

type WindowKey = 'morningFromHour' | 'morningToHour' | 'eveningFromHour' | 'eveningToHour';

function useGoalChange(deviceId: string): (goal: Partial<BrushingGoal>) => void {
  const { act } = useBrushAct(deviceId);
  return (goal): void => {
    act({ action: 'set_goal', goal }, 'The goal could not be saved');
  };
}

function WindowRow({
  deviceId,
  id,
  title,
  field,
  goal,
}: {
  readonly deviceId: string;
  readonly id: string;
  readonly title: string;
  readonly field: WindowKey;
  readonly goal: BrushingGoal;
}): ReactNode {
  const change = useGoalChange(deviceId);
  return (
    <Anchored deviceId={deviceId} id={id} label={title}>
      <StepperRow
        title={title}
        subtitle={`Currently ${hourText(goal[field])}`}
        value={goal[field]}
        range={HOURS}
        unit="h"
        onChange={(next) => {
          change({ [field]: next });
        }}
      />
    </Anchored>
  );
}

const WINDOWS = [
  { id: 'goal-morning', title: 'Morning starts', field: 'morningFromHour' },
  { id: 'goal-morning-end', title: 'Morning ends', field: 'morningToHour' },
  { id: 'goal-evening', title: 'Evening starts', field: 'eveningFromHour' },
  { id: 'goal-evening-end', title: 'Evening ends', field: 'eveningToHour' },
] as const;

function CountRows({
  deviceId,
  goal,
}: {
  readonly deviceId: string;
  readonly goal: BrushingGoal;
}): ReactNode {
  const change = useGoalChange(deviceId);
  return (
    <>
      <Anchored deviceId={deviceId} id="goal-sessions" label="Brushes per day">
        <StepperRow
          title="Brushes per day"
          value={goal.sessionsPerDay}
          range={PER_DAY}
          unit=""
          onChange={(next) => {
            change({ sessionsPerDay: next });
          }}
        />
      </Anchored>
      <Anchored deviceId={deviceId} id="goal-minimum" label="Minimum brushing time">
        <SwitchRow
          icon="timer"
          title="Count only whole routines"
          subtitle="Turn off to choose a shorter minimum"
          value={goal.minimumSeconds === null}
          onChange={(next) => {
            change({ minimumSeconds: next ? null : WHOLE_ROUTINE_S });
          }}
        />
      </Anchored>
      {goal.minimumSeconds === null ? null : (
        <StepperRow
          title="Minimum brushing time"
          value={goal.minimumSeconds}
          range={MINIMUM}
          unit="s"
          onChange={(next) => {
            change({ minimumSeconds: next });
          }}
        />
      )}
    </>
  );
}

export function GoalsList({ deviceId, settings }: SettingsProps): ReactNode {
  const { goal } = settings;
  return (
    <List
      inset
      title="Goals"
      footer="A brush counts toward the day when it lasts long enough. The evening window may end after midnight and still counts for the day before."
    >
      <CountRows deviceId={deviceId} goal={goal} />
      {WINDOWS.map((window) => (
        <WindowRow key={window.id} deviceId={deviceId} goal={goal} {...window} />
      ))}
    </List>
  );
}
